package com.shuatibox.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.shuatibox.app.update.UpdateStore

class MainActivity : TauriActivity() {
  private var webview: WebView? = null
  private var safeTop = 0
  private var safeBottom = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    Thread { UpdateStore.cleanupOld(applicationContext) }.start()

    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          val target = webview
          if (target == null) return
          target.evaluateJavascript("window.__shuatiboxBack ? window.__shuatiboxBack() : 'exit'") { result ->
            if (result == null || result.contains("exit")) {
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
            }
          }
        }
      },
    )
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.overScrollMode = WebView.OVER_SCROLL_NEVER
    webview = webView

    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
      )
      safeTop = bars.top
      safeBottom = bars.bottom
      applySafeArea(webView)
      insets
    }
    webView.post { ViewCompat.requestApplyInsets(webView) }
    webView.post {
      applySafeArea(webView)
      webView.postDelayed({ applySafeArea(webView) }, 800)
      webView.postDelayed({ applySafeArea(webView) }, 2500)
    }
  }

  override fun onResume() {
    super.onResume()
    webview?.let(::applySafeArea)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) webview?.let(::applySafeArea)
  }

  private fun applySafeArea(webView: WebView) {
    if (safeTop == 0 && safeBottom == 0) return
    val density = resources.displayMetrics.density
    val top = safeTop / density
    val bottom = safeBottom / density
    webView.evaluateJavascript(
      "if (document.documentElement) {" +
        "document.documentElement.style.setProperty('--safe-top','${top}px');" +
        "document.documentElement.style.setProperty('--safe-bottom','${bottom}px');" +
        "}",
      null,
    )
  }
}