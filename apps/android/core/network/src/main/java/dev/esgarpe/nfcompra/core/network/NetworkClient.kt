package dev.esgarpe.nfcompra.core.network

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object NetworkClient {
    fun authApi(baseUrl: String): AuthApi = retrofit(baseUrl, OkHttpClient()).create(AuthApi::class.java)

    fun authenticatedClient(baseUrl: String, tokenStore: TokenStore): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(BearerInterceptor(tokenStore))
            .authenticator(RefreshAuthenticator(authApi(baseUrl), tokenStore))
            .build()

    private fun retrofit(baseUrl: String, client: OkHttpClient): Retrofit =
        Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(MoshiConverterFactory.create(Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()))
            .build()
}
