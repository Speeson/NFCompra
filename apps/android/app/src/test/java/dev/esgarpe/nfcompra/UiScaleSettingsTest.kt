package dev.esgarpe.nfcompra

import dev.esgarpe.nfcompra.core.designsystem.BottomNavigationStylePreference
import dev.esgarpe.nfcompra.core.designsystem.ThemePreference
import dev.esgarpe.nfcompra.core.designsystem.UiScalePreference
import dev.esgarpe.nfcompra.core.designsystem.uiDensityValues
import org.junit.Assert.assertEquals
import org.junit.Test

class UiScaleSettingsTest {
    @Test
    fun `default ui scale preference is normal`() {
        val settings = UiScaleSettings(FakeUiScaleStorage())

        assertEquals(UiScalePreference.Normal, settings.preference)
    }

    @Test
    fun `persisted ui scale values are restored`() {
        val storage = FakeUiScaleStorage("large")
        val settings = UiScaleSettings(storage)

        assertEquals(UiScalePreference.Large, settings.preference)

        settings.preference = UiScalePreference.Small

        assertEquals("small", storage.persistedValue)
        assertEquals(UiScalePreference.Small, settings.preference)
    }

    @Test
    fun `unknown persisted ui scale falls back to normal`() {
        val settings = UiScaleSettings(FakeUiScaleStorage("unexpected"))

        assertEquals(UiScalePreference.Normal, settings.preference)
    }

    @Test
    fun `ui scale factors match expected values`() {
        assertEquals(0.90f, UiScalePreference.Small.factor, 0.001f)
        assertEquals(1.00f, UiScalePreference.Normal.factor, 0.001f)
        assertEquals(1.15f, UiScalePreference.Large.factor, 0.001f)
    }

    @Test
    fun `custom ui scale modes ignore android font scale`() {
        val normal = uiDensityValues(UiScalePreference.Normal, systemDensity = 3f, systemFontScale = 2f)
        val small = uiDensityValues(UiScalePreference.Small, systemDensity = 3f, systemFontScale = 2f)
        val large = uiDensityValues(UiScalePreference.Large, systemDensity = 3f, systemFontScale = 2f)

        assertEquals(3f, normal.density, 0.001f)
        assertEquals(2.7f, small.density, 0.001f)
        assertEquals(3.45f, large.density, 0.001f)
        assertEquals(1f, normal.fontScale, 0.001f)
        assertEquals(1f, small.fontScale, 0.001f)
        assertEquals(1f, large.fontScale, 0.001f)
    }

    @Test
    fun `system ui scale preserves android density and font scale`() {
        val values = uiDensityValues(UiScalePreference.System, systemDensity = 2.75f, systemFontScale = 1.85f)

        assertEquals(2.75f, values.density, 0.001f)
        assertEquals(1.85f, values.fontScale, 0.001f)
    }

    @Test
    fun `default bottom navigation style is original`() {
        val settings = BottomNavigationStyleSettings(FakeBottomNavigationStyleStorage())

        assertEquals(BottomNavigationStylePreference.Original, settings.preference)
    }

    @Test
    fun `bottom navigation style values are restored`() {
        val storage = FakeBottomNavigationStyleStorage("navbar")
        val settings = BottomNavigationStyleSettings(storage)

        assertEquals(BottomNavigationStylePreference.NavBar, settings.preference)

        settings.preference = BottomNavigationStylePreference.Original

        assertEquals("original", storage.persistedValue)
        assertEquals(BottomNavigationStylePreference.Original, settings.preference)
    }

    @Test
    fun `unknown bottom navigation style falls back to original`() {
        val settings = BottomNavigationStyleSettings(FakeBottomNavigationStyleStorage("unexpected"))

        assertEquals(BottomNavigationStylePreference.Original, settings.preference)
    }

    @Test
    fun `default theme preference is system`() {
        val settings = ThemeSettings(FakeThemeStorage())

        assertEquals(ThemePreference.System, settings.preference)
    }

    @Test
    fun `theme preference values are restored`() {
        val storage = FakeThemeStorage("dark")
        val settings = ThemeSettings(storage)

        assertEquals(ThemePreference.Dark, settings.preference)

        settings.preference = ThemePreference.Light

        assertEquals("light", storage.persistedValue)
        assertEquals(ThemePreference.Light, settings.preference)
    }

    @Test
    fun `unknown theme preference falls back to system`() {
        val settings = ThemeSettings(FakeThemeStorage("unexpected"))

        assertEquals(ThemePreference.System, settings.preference)
    }
}

private class FakeUiScaleStorage(
    override var persistedValue: String? = null,
) : UiScaleStorage

private class FakeBottomNavigationStyleStorage(
    override var persistedValue: String? = null,
) : BottomNavigationStyleStorage

private class FakeThemeStorage(
    override var persistedValue: String? = null,
) : ThemeStorage
