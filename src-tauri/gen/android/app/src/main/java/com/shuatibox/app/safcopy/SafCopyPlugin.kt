package com.shuatibox.app.safcopy

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import android.util.Log
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.io.File

@InvokeArg
class CopyTreeArgs {
    lateinit var uri: String
    var maxDepth: Int? = null
    var ext: String? = null
}

@TauriPlugin
class SafCopyPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun pick(invoke: Invoke) {
        val kind = invoke.getArgs().optString("kind", "folder")
        try {
            if (kind == "folder") {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityForResult(invoke, intent, "pickResult")
            } else if (kind == "md") {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        arrayOf(
                            "text/markdown",
                            "text/x-markdown",
                            "text/plain",
                            "application/octet-stream",
                        ),
                    )
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityForResult(invoke, intent, "pickResult")
            } else if (kind == "font") {
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(
                        Intent.EXTRA_MIME_TYPES,
                        arrayOf(
                            "font/ttf",
                            "font/otf",
                            "font/woff",
                            "font/woff2",
                            "application/x-font-ttf",
                            "application/x-font-opentype",
                            "application/octet-stream",
                        ),
                    )
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityForResult(invoke, intent, "pickResult")
            } else {
                val mime = if (kind == "image") "image/*" else "application/zip"
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = mime
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivityForResult(invoke, intent, "pickResult")
            }
        } catch (error: Exception) {
            Log.e("SafCopy", "safcopy pick failed", error)
            invoke.reject(error.message ?: "无法打开文件选择器")
        }
    }

    @ActivityCallback
    fun pickResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) {
            invoke.reject("已取消选择")
            return
        }
        val uris = mutableListOf<Uri>()
        result.data?.clipData?.let { clip ->
            for (index in 0 until clip.itemCount) {
                uris.add(clip.getItemAt(index).uri)
            }
        }
        result.data?.data?.let { uri ->
            if (!uris.contains(uri)) uris.add(uri)
        }
        if (uris.isEmpty()) {
            invoke.reject("未获取到文件")
            return
        }
        for (uri in uris) {
            try {
                activity.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            } catch (error: Exception) {
                Log.e("SafCopy", "takePersistableUriPermission failed", error)
            }
        }
        val ret = JSObject()
        ret.put("uri", uris.first().toString())
        val array = JSONArray()
        uris.forEach { array.put(it.toString()) }
        ret.put("uris", array)
        invoke.resolve(ret)
    }

    @Command
    fun copyTree(invoke: Invoke) {
        val args = invoke.parseArgs(CopyTreeArgs::class.java)
        val source = Uri.parse(args.uri)
        val maxDepth = args.maxDepth ?: 6
        Log.i("SafCopy", "copyTree uri=$source tree=${DocumentsContract.isTreeUri(source)} cache=${activity.cacheDir.absolutePath}")
        Thread {
            try {
                val dest = File(activity.cacheDir, "safcopy-${System.currentTimeMillis()}")
                dest.mkdirs()
                val resolved = if (DocumentsContract.isTreeUri(source)) {
                    val rootUri = DocumentsContract.buildDocumentUriUsingTree(
                        source,
                        DocumentsContract.getTreeDocumentId(source),
                    )
                    copyDirectory(activity, rootUri, dest, maxDepth)
                    dest.absolutePath
                } else {
                    var name = displayName(activity, source)
                        ?: DocumentsContract.getDocumentId(source).substringAfterLast(':').substringAfterLast('/')
                    if (name.isEmpty()) name = "input.zip"
                    if (!name.contains('.') && !args.ext.isNullOrBlank()) name = "$name.${args.ext}"
                    val target = File(dest, sanitize(name))
                    copyFile(activity, source, target)
                    target.absolutePath
                }
                activity.runOnUiThread {
                    val ret = JSObject()
                    ret.put("path", resolved)
                    invoke.resolve(ret)
                }
            } catch (error: Exception) {
                Log.e("SafCopy", "safcopy failed", error)
                activity.runOnUiThread { invoke.reject("${error.javaClass.simpleName}: ${error.message}") }
            }
        }.start()
    }

    private fun copyDirectory(context: Context, treeUri: Uri, dest: File, depth: Int) {
        if (depth < 0) return
        val childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri,
            DocumentsContract.getDocumentId(treeUri),
        )
        val columns = arrayOf(
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE,
        )
        val cursor = try {
            context.contentResolver.query(childrenUri, columns, null, null, null)
        } catch (error: Exception) {
            Log.e("SafCopy", "query failed uri=$childrenUri", error)
            throw error
        }
        Log.i("SafCopy", "query uri=$childrenUri cursor=${cursor != null} count=${cursor?.count ?: -1}")
        cursor?.use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getString(0) ?: continue
                val name = sanitize(cursor.getString(1) ?: continue)
                if (name.startsWith(".") || name == "__MACOSX") continue
                val mime = cursor.getString(2) ?: ""
                val childUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id)
                val target = File(dest, name)
                if (mime == DocumentsContract.Document.MIME_TYPE_DIR) {
                    target.mkdirs()
                    copyDirectory(context, childUri, target, depth - 1)
                } else {
                    copyFile(context, childUri, target)
                }
            }
        }
    }

    private fun copyFile(context: Context, source: Uri, target: File) {
        Log.i("SafCopy", "safcopy: $source -> ${target.absolutePath}")
        target.parentFile?.mkdirs()
        val input = context.contentResolver.openInputStream(source)
            ?: throw IllegalStateException("无法读取：$source")
        input.use { stream ->
            target.outputStream().use { output -> stream.copyTo(output) }
        }
    }

    private fun displayName(context: Context, uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    } catch (error: Exception) {
        Log.e("SafCopy", "displayName failed", error)
        null
    }

    private fun sanitize(value: String): String = value.replace('/', '_').replace('\\', '_')
}
