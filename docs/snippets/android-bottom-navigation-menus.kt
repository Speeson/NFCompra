/*
 * NFCompra bottom navigation reference snippets.
 *
 * This file is intentionally documentation-only. It keeps the current Original
 * and NavBar menu models in a portable shape for future Android Compose apps.
 */

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.ListAlt
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.atan2
import kotlin.math.sqrt

private val NfcompraMenuGradient = listOf(Color(0xFFAEDC81), Color(0xFF6CC51D))
private val NfcompraMenuGreen = Color(0xFF6CC51D)
private val NfcompraMenuSurface = Color.White

@Immutable
private data class BottomMenuItem(
    val label: String,
    val icon: ImageVector,
)

private val ExampleBottomMenuItems = listOf(
    BottomMenuItem("Inicio", Icons.Outlined.Home),
    BottomMenuItem("Listas", Icons.Outlined.ListAlt),
    BottomMenuItem("Catalogo", Icons.Outlined.GridView),
    BottomMenuItem("Perfil", Icons.Outlined.Person),
)

@Composable
private fun OriginalBottomMenu(
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    items: List<BottomMenuItem> = ExampleBottomMenuItems,
) {
    val safeSelectedIndex = selectedIndex.coerceIn(items.indices)
    val navHeight = 104.dp
    val barHeight = 74.dp
    val bubbleSize = 70.dp
    val iconSize = 28.dp

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .height(navHeight)
            .padding(start = 18.dp, end = 18.dp, bottom = 10.dp)
            .semantics { contentDescription = "Menu inferior principal" },
    ) {
        val itemWidth = maxWidth / items.size
        val activeX by animateDpAsState(
            targetValue = itemWidth * safeSelectedIndex + (itemWidth - bubbleSize) / 2,
            animationSpec = tween(durationMillis = 260),
            label = "original-bottom-menu-active-x",
        )

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(barHeight)
                .shadow(18.dp, MaterialTheme.shapes.extraLarge, clip = false)
                .clip(MaterialTheme.shapes.extraLarge)
                .background(Brush.linearGradient(NfcompraMenuGradient)),
        )

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .height(barHeight),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            items.forEachIndexed { index, item ->
                OriginalBottomMenuItem(
                    item = item,
                    selected = index == safeSelectedIndex,
                    onClick = { onSelect(index) },
                    modifier = Modifier.weight(1f),
                )
            }
        }

        Box(
            modifier = Modifier
                .offset(x = activeX)
                .size(bubbleSize)
                .shadow(14.dp, CircleShape, clip = false)
                .clip(CircleShape)
                .background(NfcompraMenuSurface)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onSelect(safeSelectedIndex) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = items[safeSelectedIndex].icon,
                contentDescription = null,
                tint = NfcompraMenuGreen,
                modifier = Modifier.size(iconSize),
            )
        }
    }
}

@Composable
private fun OriginalBottomMenuItem(
    item: BottomMenuItem,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .height(68.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(top = 9.dp, bottom = 9.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Box(modifier = Modifier.size(26.dp), contentAlignment = Alignment.Center) {
            if (!selected) {
                Icon(
                    imageVector = item.icon,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.78f),
                    modifier = Modifier.size(22.dp),
                )
            }
        }
        Text(
            text = item.label,
            color = Color.White,
            fontSize = 11.sp,
            lineHeight = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Clip,
            softWrap = false,
        )
    }
}

@Immutable
private data class NavBarBottomMenuColors(
    val bubble: Color = Color.White,
    val bubbleIcon: Color = NfcompraMenuGreen,
    val active: Color = Color.White,
    val inactive: Color = Color.White.copy(alpha = 0.82f),
    val shadow: Color = Color(0x33000000),
)

@Composable
private fun NavBarBottomMenu(
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    items: List<BottomMenuItem> = ExampleBottomMenuItems,
    colors: NavBarBottomMenuColors = NavBarBottomMenuColors(),
) {
    val safeSelectedIndex = selectedIndex.coerceIn(items.indices)
    val barHeight = 64.dp
    val bubbleSize = 58.dp
    val overhang = bubbleSize / 2
    val horizontalPadding = 20.dp
    val innerPadding = 8.dp

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .height(barHeight + overhang + 14.dp)
            .padding(start = horizontalPadding, end = horizontalPadding, bottom = 10.dp)
            .semantics { contentDescription = "Menu inferior principal" },
    ) {
        val slot = (maxWidth - innerPadding * 2) / items.size
        fun centerOf(index: Int): Dp = innerPadding + slot * (index + 0.5f)
        val activeCenterX by animateFloatAsState(
            targetValue = centerOf(safeSelectedIndex).value,
            animationSpec = tween(durationMillis = 420, easing = FastOutSlowInEasing),
            label = "navbar-bottom-menu-active-x",
        )
        val activeCenterXDp = activeCenterX.dp

        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(barHeight)
                .align(Alignment.BottomCenter),
        ) {
            val path = navBarBottomMenuPath(size, activeCenterXDp.toPx())
            drawNavBarBottomMenuShadow(path, colors.shadow)
            drawPath(path, Brush.linearGradient(NfcompraMenuGradient))
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(barHeight)
                .align(Alignment.BottomCenter)
                .padding(horizontal = innerPadding),
            verticalAlignment = Alignment.Bottom,
        ) {
            items.forEachIndexed { index, item ->
                val active = index == safeSelectedIndex
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxSize()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) { onSelect(index) }
                        .padding(bottom = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Bottom,
                ) {
                    if (!active) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = null,
                            tint = colors.inactive,
                            modifier = Modifier.size(22.dp),
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                    }
                    Text(
                        text = item.label,
                        color = if (active) colors.active else colors.inactive,
                        fontSize = 11.sp,
                        lineHeight = 12.sp,
                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                        softWrap = false,
                    )
                }
            }
        }

        Box(
            modifier = Modifier
                .offset(x = activeCenterXDp - bubbleSize / 2)
                .size(bubbleSize)
                .shadow(10.dp, CircleShape, clip = false)
                .clip(CircleShape)
                .background(colors.bubble)
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                ) { onSelect(safeSelectedIndex) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = items[safeSelectedIndex].icon,
                contentDescription = null,
                tint = colors.bubbleIcon,
                modifier = Modifier.size(25.dp),
            )
        }
    }
}

private fun DrawScope.navBarBottomMenuPath(size: Size, centerX: Float): Path {
    val radius = 22.dp.toPx()
    val cutRadius = 35.dp.toPx()
    val fillet = 20.dp.toPx()
    val bar = Path().apply {
        addRoundRect(RoundRect(Rect(0f, 0f, size.width, size.height), CornerRadius(radius, radius)))
    }
    val tangentOffset = sqrt(cutRadius * cutRadius + 2f * cutRadius * fillet)
    val tangentRatio = cutRadius / (cutRadius + fillet)
    val tangentX = tangentRatio * tangentOffset
    val tangentY = tangentRatio * fillet
    val sweep = Math.toDegrees(atan2((tangentY - fillet).toDouble(), (tangentOffset - tangentX).toDouble())).toFloat() + 90f

    val circle = Path().apply { addOval(Rect(Offset(centerX, 0f), cutRadius)) }
    val left = Path().apply {
        moveTo(centerX - tangentOffset, 0f)
        arcTo(Rect(Offset(centerX - tangentOffset, fillet), fillet), -90f, sweep, false)
        lineTo(centerX, tangentY)
        lineTo(centerX, -fillet)
        lineTo(centerX - tangentOffset, -fillet)
        close()
    }
    val right = Path().apply {
        moveTo(centerX + tangentOffset, 0f)
        arcTo(Rect(Offset(centerX + tangentOffset, fillet), fillet), -90f, -sweep, false)
        lineTo(centerX, tangentY)
        lineTo(centerX, -fillet)
        lineTo(centerX + tangentOffset, -fillet)
        close()
    }
    val hole = Path().apply {
        op(circle, left, PathOperation.Union)
        op(this, right, PathOperation.Union)
    }
    return Path().apply { op(bar, hole, PathOperation.Difference) }
}

private fun DrawScope.drawNavBarBottomMenuShadow(path: Path, color: Color) {
    drawIntoCanvas { canvas ->
        val paint = Paint()
        paint.asFrameworkPaint().apply {
            isAntiAlias = true
            this.color = android.graphics.Color.TRANSPARENT
            setShadowLayer(9.dp.toPx(), 0f, 6.dp.toPx(), color.toArgb())
        }
        canvas.drawPath(path, paint)
    }
}
