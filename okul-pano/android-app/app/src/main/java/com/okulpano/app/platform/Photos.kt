package com.okulpano.app.platform

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File

/** Yüklenecek fotoğraf: JPEG'e çevrilmiş ve en uzun kenarı 1920 px'e küçültülmüş */
class Photo(val bytes: ByteArray, val mime: String = "image/jpeg", val name: String = "foto.jpg")

class PhotoPicker(val takePhoto: () -> Unit, val pickFromGallery: () -> Unit)

/**
 * Kamera ve galeri: kamera fotoğrafı uygulamanın geçici klasörüne yazar, galeri sistemin fotoğraf seçicisini açar
 * (izin istemez). Seçilen fotoğraf küçültülüp [onPicked]'e verilir.
 */
@Composable
fun rememberPhotoPicker(onPicked: (Photo) -> Unit, onError: (String) -> Unit = {}): PhotoPicker {
  val context = LocalContext.current
  val target = remember { photoFile(context) }
  val targetUri = remember { FileProvider.getUriForFile(context, "${context.packageName}.files", target) }
  val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
    if (ok) runCatching { onPicked(compress(context, targetUri)) }.onFailure { onError("Fotoğraf okunamadı") }
  }
  // Uygulama kamera iznini (QR için) bildirdiği için sistem kamerasını açmadan önce izin alınmalı
  val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    if (granted) camera.launch(targetUri) else onError("Kamera izni verilmedi. Telefon ayarlarından açabilirsiniz.")
  }
  val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
    if (uri != null) runCatching { onPicked(compress(context, uri)) }.onFailure { onError("Fotoğraf okunamadı") }
  }
  return remember {
    PhotoPicker(
      takePhoto = {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) camera.launch(targetUri)
        else permission.launch(Manifest.permission.CAMERA)
      },
      pickFromGallery = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
    )
  }
}

private fun photoFile(context: Context): File {
  val dir = File(context.cacheDir, "photos").apply { mkdirs() }
  return File(dir, "kamera.jpg")
}

private fun compress(context: Context, uri: Uri, maxSide: Int = 1920): Photo {
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
  var sample = 1
  while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
  val bitmap = context.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
    ?: error("Fotoğraf çözülemedi")
  val scale = maxSide.toFloat() / maxOf(bitmap.width, bitmap.height)
  val sized = if (scale < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true) else bitmap
  val out = ByteArrayOutputStream()
  sized.compress(Bitmap.CompressFormat.JPEG, 85, out)
  return Photo(out.toByteArray())
}
