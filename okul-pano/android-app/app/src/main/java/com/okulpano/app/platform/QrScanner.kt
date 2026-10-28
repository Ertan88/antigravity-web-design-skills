package com.okulpano.app.platform

import androidx.annotation.OptIn
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/** QR'daki adres ya da düz kod → 6 karakterlik eşleştirme kodu ("okulpano://eslestir/K7M2QX") */
fun codeFromQr(data: String): String? {
  val m = Regex("""eslestir/([A-Za-z0-9]{6})\b""").find(data) ?: Regex("""^\s*([A-Za-z0-9]{6})\s*$""").find(data)
  return m?.groupValues?.get(1)?.uppercase()
}

/** Kamera önizlemesi; her karede QR aranır, bulunan metin [onCode]'a verilir (cihaz üzerinde, internet gerekmez) */
@OptIn(ExperimentalGetImage::class)
@Composable
fun QrCameraView(onCode: (String) -> Unit, modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val owner = LocalLifecycleOwner.current
  val executor = remember { Executors.newSingleThreadExecutor() }
  val scanner = remember { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()) }
  DisposableEffect(Unit) {
    onDispose {
      scanner.close()
      executor.shutdown()
    }
  }
  AndroidView(
    modifier = modifier,
    factory = { ctx ->
      val view = PreviewView(ctx)
      val providerFuture = ProcessCameraProvider.getInstance(ctx)
      providerFuture.addListener({
        val provider = providerFuture.get()
        val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
        val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analysis.setAnalyzer(executor) { proxy ->
          val media = proxy.image
          if (media == null) {
            proxy.close()
            return@setAnalyzer
          }
          scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
            .addOnSuccessListener { codes -> codes.firstNotNullOfOrNull { it.rawValue }?.let(onCode) }
            .addOnCompleteListener { proxy.close() }
        }
        provider.unbindAll()
        provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
      }, ContextCompat.getMainExecutor(context))
      view
    },
  )
}
