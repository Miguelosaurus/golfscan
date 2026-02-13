import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { MotiView } from "moti";
import Animated, {
  Easing as ReanimatedEasing,
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/constants/colors";
import { useT } from "@/lib/i18n";

type Props = {
  handicap: number;
  count?: number;
  variant?: "inline" | "overlay";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatHandicap(handicap: number) {
  if (!Number.isFinite(handicap)) return "—";
  const rounded = Math.round(handicap * 10) / 10;
  return rounded.toFixed(1);
}

function buildConvergingSeries(target: number, points: number) {
  const safeTarget = Number.isFinite(target) ? target : 15;
  const result: number[] = [];
  let value = safeTarget + (Math.random() * 10 - 5);
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const noise = (Math.random() * 2 - 1) * (1 - t) * 3.5;
    value = value + (safeTarget - value) * (0.28 + t * 0.45) + noise;
    result.push(value);
  }
  // finish exactly on target for the "lock in" feeling
  result[result.length - 1] = safeTarget;
  return result;
}

function toPath(values: number[], width: number, height: number, padding = 8) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const xStep = (width - padding * 2) / (values.length - 1);

  const points = values.map((v, i) => {
    const x = padding + i * xStep;
    const yNorm = (v - min) / range;
    const y = padding + (1 - yNorm) * (height - padding * 2);
    return { x, y };
  });

  // Use a straight-segment path so the moving dot (linear interpolation) stays perfectly on the line.
  // Rounded joins/caps provide a smooth visual without bezier drift.
  let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const p1 = points[i]!;
    d += ` L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  const last = points[points.length - 1]!;
  const first = points[0]!;
  const area =
    d +
    ` L ${last.x.toFixed(2)} ${(height - padding).toFixed(2)}` +
    ` L ${first.x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;

  return { line: d, area, points };
}

export function SeedRoundsStory({ handicap, count = 20, variant = "inline" }: Props) {
  const t = useT();
  const chartWidth = variant === "overlay" ? 280 : 310;
  const chartHeight = variant === "overlay" ? 86 : 92;

  const series = useMemo(() => buildConvergingSeries(handicap, 26), [handicap]);
  const path = useMemo(() => toPath(series, chartWidth, chartHeight), [series, chartWidth, chartHeight]);

  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: 3400, // slower
        easing: ReanimatedEasing.linear, // smooth constant velocity
      }),
      -1,
      false
    );
  }, []);

  const [seedTick, setSeedTick] = useState(1);
  useEffect(() => {
    // lightweight JS counter for the caption; dot motion is handled natively by Reanimated.
    const interval = setInterval(() => {
      setSeedTick((prev) => (prev >= count ? 1 : prev + 1));
    }, 170);
    return () => clearInterval(interval);
  }, [count]);

  const inputRange = useMemo(
    () => path.points.map((_, i) => i / (path.points.length - 1)),
    [path.points]
  );
  const yRange = useMemo(() => path.points.map((p) => p.y), [path.points]);
  const xMin = 8;
  const xMax = chartWidth - 8;

  const dotAnimStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const x = xMin + t * (xMax - xMin);
    const y = interpolate(t, inputRange, yRange, Extrapolate.CLAMP);
    return {
      transform: [{ translateX: x - 7 }, { translateY: y - 7 }],
    };
  }, [chartWidth, chartHeight, inputRange, yRange]);

  return (
    <View style={[styles.card, variant === "overlay" && styles.cardOverlay]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("Seeding your starting index")}</Text>
          <Text style={styles.subtitle}>
            {variant === "overlay"
              ? t("Creating 20 seed rounds, then locking in your Scandicap™.")
              : t("We’ll generate 20 seed rounds after sign-in so your Scandicap™ starts at the right place.")}
          </Text>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeTop}>{t("Index")}</Text>
          <Text style={styles.badgeValue}>{formatHandicap(handicap)}</Text>
        </View>
      </View>

      <View style={styles.chartWrap}>
        <View style={[styles.chartCanvas, { width: chartWidth, height: chartHeight }]}>
          <Svg width={chartWidth} height={chartHeight}>
            <Defs>
              <LinearGradient id="seedFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.22" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="0.02" />
              </LinearGradient>
              <LinearGradient id="seedStroke" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.primary} stopOpacity="0.55" />
                <Stop offset="1" stopColor={colors.primary} stopOpacity="1" />
              </LinearGradient>
            </Defs>

            <Path d={path.area} fill="url(#seedFill)" />
            <Path
              d={path.line}
              stroke="url(#seedStroke)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>

          <MotiView
            from={{ opacity: 0.0, translateX: -34 }}
            animate={{ opacity: 0.16, translateX: 34 }}
            transition={{ type: "timing", duration: 1200, loop: true }}
            style={styles.sheen}
            pointerEvents="none"
          />

          <Animated.View pointerEvents="none" style={[styles.dotWrap, dotAnimStyle]}>
            <View style={styles.dot} />
            <MotiView
              from={{ opacity: 0.0, scale: 0.8 }}
              animate={{ opacity: 0.26, scale: 1.55 }}
              transition={{ type: "timing", duration: 850, loop: true }}
              style={styles.dotPulse}
            />
          </Animated.View>
        </View>
      </View>

      <MotiView
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 220 }}
        style={styles.captionRow}
      >
        <Text style={styles.captionText}>{t("Seeding…")}</Text>
        <Text style={styles.captionCount}>
          {seedTick}/{count}
        </Text>
      </MotiView>

      {variant !== "overlay" && (
        <Text style={styles.footer}>
          {t("Seeds are marked as synthesized and get replaced naturally as you add real rounds.")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    padding: 14,
    overflow: "hidden",
  },
  cardOverlay: {
    marginTop: 12,
    width: "100%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  badge: {
    borderRadius: 14,
    backgroundColor: "#FFF8F5",
    borderWidth: 1,
    borderColor: "rgba(231, 106, 59, 0.22)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  badgeTop: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  badgeValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 0.2,
  },
  chartWrap: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#FBFAF8",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  chartCanvas: {
    position: "relative",
  },
  sheen: {
    position: "absolute",
    top: -30,
    bottom: -30,
    left: "50%",
    width: 80,
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
  },
  dotWrap: {
    position: "absolute",
    width: 14,
    height: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  dotPulse: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
  },
  captionRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  captionText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textSecondary,
  },
  captionCount: {
    fontSize: 12,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 0.2,
  },
  footer: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
