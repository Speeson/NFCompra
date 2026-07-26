plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "dev.esgarpe.nfcompra.core.designsystem"
    compileSdk = 35
    defaultConfig { minSdk = 24 }
}

dependencies {
    implementation("androidx.compose.material3:material3:1.3.2")
}
