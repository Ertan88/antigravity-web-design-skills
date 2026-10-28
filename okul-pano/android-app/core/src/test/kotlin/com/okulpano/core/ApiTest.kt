package com.okulpano.core

import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class ApiTest {
  @Test fun refreshesOn401AndRetries() = runBlocking {
    val server = MockWebServer()
    server.enqueue(MockResponse().setResponseCode(401))
    server.enqueue(MockResponse().setBody("""{"accessToken":"A2","refreshToken":"R2"}"""))
    server.enqueue(MockResponse().setBody("""{"user":{"id":"u","email":"e@x","fullName":"E"},"schools":[]}"""))
    server.start()
    val store = MemorySessionStore(server.url("").toString().trimEnd('/'), "R1")
    val api = OkulApi(store).apply { accessToken = "A1" }
    val me: Me = api.get("/api/me")
    assertEquals("E", me.user.fullName)
    assertEquals("R2", store.refreshToken)
    assertEquals("A2", api.accessToken)
    server.takeRequest()
    assertTrue(server.takeRequest().path!!.endsWith("/api/auth/refresh"))
    assertEquals("Bearer A2", server.takeRequest().getHeader("Authorization"))
    server.shutdown()
  }

  @Test fun turkishErrorMessage() = runBlocking {
    val server = MockWebServer()
    server.enqueue(MockResponse().setResponseCode(400).setBody("""{"message":"Mevcut şifre hatalı."}"""))
    server.enqueue(MockResponse().setResponseCode(204))
    server.start()
    val api = OkulApi(MemorySessionStore(server.url("").toString().trimEnd('/')))
    val e = assertFailsWith<ApiException> { api.send("/api/me/password", "POST", body("currentPassword" to "x")) }
    assertEquals("Mevcut şifre hatalı.", e.message)
    api.send("/api/x", "DELETE")
    server.shutdown()
  }

  @Test fun normalizesServer() {
    assertEquals("https://okul.example.com", normalizeServer(" okul.example.com/ "))
    assertEquals("http://10.0.2.2:3000", normalizeServer("http://10.0.2.2:3000"))
  }
}
