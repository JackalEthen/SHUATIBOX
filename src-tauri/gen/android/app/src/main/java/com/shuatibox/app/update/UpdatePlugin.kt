package com.shuatibox.app.update

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

private const val CHANNEL_ID = "shuatibox_update"
private const val NOTIFICATION_ID = 4201
private const val INSTALL_REQUEST_ID = 4202
private const val APK_MIME = "application/vnd.android.package-archive"
private const val UPDATE_DIR = "SHUATIBOX"
private const val PREFS = "shuatibox_update"
private const val KEY_URIS = "uris"
private const val EXTRA_URI = "update_uri"

@InvokeArg
class DownloadArgs {
    lateinit var url: String
    lateinit var fileName: String
}

@TauriPlugin
class UpdatePlugin(private val activity: Activity) : Plugin(activity) {
    companion object {
        private val downloading = AtomicBoolean(false)
    }

    @Command
    fun download(invoke: Invoke) {
        val args = invoke.parseArgs(DownloadArgs::class.java)
        if (!downloading.compareAndSet(false, true)) {
            invoke.reject("已有更新正在下载")
            return
        }
        ensureChannel(activity)
        requestNotificationPermission(activity)
        val safeName = args.fileName
            .replace(Regex("[^A-Za-z0-9._-]"), "_")
            .ifEmpty { "shuatibox-update.apk" }

        activity.runOnUiThread {
            invoke.resolve(JSObject().put("status", "started"))
        }

        Thread {
            try {
                UpdateStore.cleanupOld(activity)
                val result = downloadFile(activity, args.url, safeName)
                UpdateStore.add(activity, result.uri, result.file)
                showComplete(activity, result.uri, safeName)
            } catch (error: Exception) {
                Log.e("UpdatePlugin", "download failed", error)
                showFailed(activity, error.message ?: "下载失败")
                activity.runOnUiThread {
                    Toast.makeText(activity, "更新下载失败：${error.message ?: "未知错误"}", Toast.LENGTH_LONG).show()
                }
            } finally {
                downloading.set(false)
            }
        }.start()
    }

    private data class DownloadResult(val uri: Uri, val file: File?)

    private fun downloadFile(context: Context, url: String, fileName: String): DownloadResult {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true
            connectTimeout = 15000
            readTimeout = 30000
            setRequestProperty("User-Agent", "SHUATIBOX-update-download")
            setRequestProperty("Accept", "application/octet-stream")
        }
        connection.connect()
        val code = connection.responseCode
        if (code !in 200..299) {
            connection.disconnect()
            throw IllegalStateException("下载失败：HTTP $code")
        }
        val total = connection.contentLengthLong
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, APK_MIME)
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$UPDATE_DIR")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = context.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("无法写入 Download 目录")
                try {
                    resolver.openOutputStream(uri)?.use { output ->
                        connection.inputStream.use { input -> copy(input, output, total, context) }
                    } ?: throw IllegalStateException("无法写入安装包")
                    values.clear()
                    values.put(MediaStore.Downloads.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                    return DownloadResult(uri, null)
                } catch (error: Exception) {
                    runCatching { resolver.delete(uri, null, null) }
                    throw error
                }
            }

            val dir = legacyDir(context)
            val file = File(dir, fileName)
            connection.inputStream.use { input ->
                file.outputStream().use { output -> copy(input, output, total, context) }
            }
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            return DownloadResult(uri, file)
        } finally {
            connection.disconnect()
        }
    }

    private fun legacyDir(context: Context): File {
        val public = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), UPDATE_DIR)
        if (public.exists() || public.mkdirs()) return public
        val privateDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir, UPDATE_DIR)
        privateDir.mkdirs()
        return privateDir
    }

    private fun copy(input: InputStream, output: OutputStream, total: Long, context: Context) {
        val buffer = ByteArray(16 * 1024)
        var written = 0L
        var last = -1
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            written += count
            val progress = if (total > 0) ((written * 100) / total).toInt() else -1
            if (progress != last) {
                last = progress
                showProgress(context, progress)
            }
        }
        output.flush()
    }
}

private fun requestNotificationPermission(activity: Activity) {
    if (Build.VERSION.SDK_INT >= 33 &&
        activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
        activity.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4203)
    }
}

private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "软件更新", NotificationManager.IMPORTANCE_LOW).apply {
                description = "更新下载与安装提醒"
            },
        )
    }
}

private fun notify(context: Context, notification: android.app.Notification) {
    try {
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (error: SecurityException) {
        Log.e("UpdatePlugin", "notify failed", error)
    }
}

private fun showProgress(context: Context, progress: Int) {
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download)
        .setContentTitle("正在下载更新")
        .setContentText(if (progress >= 0) "$progress%" else "下载中…")
        .setOnlyAlertOnce(true)
        .setOngoing(true)
        .setProgress(100, progress.coerceAtLeast(0), progress < 0)
    notify(context, builder.build())
}

private fun showComplete(context: Context, uri: Uri, fileName: String) {
    val install = Intent(context, InstallReceiver::class.java)
        .putExtra(EXTRA_URI, uri.toString())
    val pending = PendingIntent.getBroadcast(
        context,
        INSTALL_REQUEST_ID,
        install,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_sys_download_done)
        .setContentTitle("更新已下载")
        .setContentText("点击安装 $fileName")
        .setAutoCancel(true)
        .setContentIntent(pending)
        .build()
    notify(context, notification)
}

private fun showFailed(context: Context, message: String) {
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.stat_notify_error)
        .setContentTitle("更新下载失败")
        .setContentText(message)
        .setAutoCancel(true)
        .build()
    notify(context, notification)
}

class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val uri = intent.getStringExtra(EXTRA_URI) ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !context.packageManager.canRequestPackageInstalls()
        ) {
            val settings = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(settings)
            return
        }
        val install = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(Uri.parse(uri), APK_MIME)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(install)
    }
}

class UpdateCleanupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        UpdateStore.cleanupInstalled(context)
    }
}

object UpdateStore {
    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun add(context: Context, uri: Uri, file: File?) {
        val values = prefs(context).getStringSet(KEY_URIS, emptySet())?.toMutableSet() ?: mutableSetOf()
        values.add("${uri}\n${file?.absolutePath ?: ""}")
        prefs(context).edit().putStringSet(KEY_URIS, values).apply()
    }

    fun cleanupInstalled(context: Context) {
        val values = prefs(context).getStringSet(KEY_URIS, emptySet())?.toList() ?: emptyList()
        values.forEach { deleteEntry(context, it) }
        prefs(context).edit().remove(KEY_URIS).apply()
    }

    fun cleanupOld(context: Context) {
        val cutoff = System.currentTimeMillis() - 3L * 24 * 60 * 60 * 1000
        val privateDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir, UPDATE_DIR)
        privateDir.listFiles()
            ?.filter { it.lastModified() < cutoff }
            ?.forEach { runCatching { it.delete() } }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), UPDATE_DIR)
                .listFiles()
                ?.filter { it.lastModified() < cutoff }
                ?.forEach { runCatching { it.delete() } }
            return
        }
        val collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI
        val projection = arrayOf(MediaStore.Downloads._ID, MediaStore.Downloads.DATE_ADDED)
        val selection = "${MediaStore.Downloads.RELATIVE_PATH} LIKE ?"
        val args = arrayOf("%${Environment.DIRECTORY_DOWNLOADS}/$UPDATE_DIR%")
        runCatching {
            context.contentResolver.query(collection, projection, selection, args, null)?.use { cursor ->
                while (cursor.moveToNext()) {
                    val added = cursor.getLong(1) * 1000
                    if (added < cutoff) {
                        val uri = ContentUris.withAppendedId(collection, cursor.getLong(0))
                        runCatching { context.contentResolver.delete(uri, null, null) }
                    }
                }
            }
        }
    }

    private fun deleteEntry(context: Context, value: String) {
        val parts = value.split('\n', limit = 2)
        if (parts.isEmpty() || parts[0].isBlank()) return
        runCatching { context.contentResolver.delete(Uri.parse(parts[0]), null, null) }
        if (parts.size > 1 && parts[1].isNotBlank()) {
            runCatching { File(parts[1]).delete() }
        }
    }
}
