package com.okulpano.app

import android.app.Application
import com.okulpano.app.data.AppContainer

class OkulApp : Application() {
  lateinit var container: AppContainer
    private set

  override fun onCreate() {
    super.onCreate()
    container = AppContainer(this)
  }
}
