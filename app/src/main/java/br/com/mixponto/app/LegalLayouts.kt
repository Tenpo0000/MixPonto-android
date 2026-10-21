package br.com.mixponto.app

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.widget.ScrollView

/** Mantém o conteúdo fora das barras do sistema também no modo edge-to-edge. */
internal fun Activity.legalScroll(content: View): ScrollView = ScrollView(this).apply {
    isFillViewport = true
    addView(content)
    setOnApplyWindowInsetsListener { view, insets ->
        if (Build.VERSION.SDK_INT >= 30) {
            val safeArea = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime() or WindowInsets.Type.displayCutout())
            view.setPadding(safeArea.left, safeArea.top, safeArea.right, safeArea.bottom)
        } else {
            @Suppress("DEPRECATION")
            view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
        }
        insets
    }
}
