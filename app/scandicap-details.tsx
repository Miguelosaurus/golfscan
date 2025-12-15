import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  ImageBackground,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useQuery, useMutation } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { colors } from "@/constants/colors";
import { useWindowDimensions, Platform } from "react-native";
import { LineChart } from "react-native-gifted-charts";
import {
  Info,
  TrendingUp,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  CloudDownload,
  History,
  RefreshCw,
  Plus,
  Trash2,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";

// Local palette tuned to the brand illustration
const ROUGH_GREEN_DARK = "#0A261C";
const ROUGH_GREEN_LIGHT = "#154030"; // Slightly lighter for gradient start

const PAPER_BG_LIGHT = "#F3F0E0"; // Lighter center of paper
const PAPER_BG_DARK = "#E6E2CF"; // Darker edges/bottom of paper

const DEEP_TEXT = "#2A5240"; // Intermediate green as requested
const ANTIQUE_GOLD = "#C5A065"; // Gold
const SUBTLE_GOLD = "#D6C6A0";
const WHITE_MIST = "#E1F2EA";

export default function ScandicapDetailsScreen() {
  const profile = useQuery(api.users.getProfile);
  const userId = profile?._id as any;
  const details =
    useQuery(
      api.handicap.getDetails,
      userId ? { userId } : "skip"
    ) || null;
  const rebuildHistory = useMutation(api.handicap.rebuildHistory);
  const seedHandicap = useMutation(api.handicap.seedHandicap);
  const clearSeededRounds = useMutation(api.handicap.clearSeededRounds);

  const { width } = useWindowDimensions();

  const loading = details === undefined;

  const history = details?.history ?? [];
  const hasHistory = history.length > 0 && (details?.roundsCount ?? 0) > 0;
  const [activePoint, setActivePoint] = useState<{
    label: string;
    value: number;
  } | null>(null);
  const [howExpanded, setHowExpanded] = useState(false);
  const [timeRange, setTimeRange] = useState<"1M" | "3M" | "6M" | "1Y" | "All">("All");

  const { chartData, chartSeries, lowWaterMark, yMin, yMax } = useMemo(() => {
    if (!history.length) {
      return { chartData: null, chartSeries: [] as { date: string; value: number; isSynthesized?: boolean }[], lowWaterMark: null as number | null, yMin: 0, yMax: 10 };
    }
    const sorted = [...history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );

    // Filter by Time Range
    const now = new Date();
    const filtered = sorted.filter((h) => {
      const d = new Date(h.date);
      if (timeRange === "All") return true;
      if (timeRange === "1M") return d >= new Date(now.setMonth(now.getMonth() - 1));
      if (timeRange === "3M") return d >= new Date(now.setMonth(now.getMonth() - 3));
      if (timeRange === "6M") return d >= new Date(now.setMonth(now.getMonth() - 6));
      if (timeRange === "1Y") return d >= new Date(now.setFullYear(now.getFullYear() - 1));
      return true;
    });

    // Include isSynthesized flag in series, floor values at 0
    const series = filtered.length > 0 ? filtered.map((h) => ({
      date: h.date,
      value: Math.max(0, h.value), // Floor at 0 (no negative handicaps)
      isSynthesized: (h as any).isSynthesized ?? false,
    })) : [];

    // Format data for react-native-gifted-charts
    const chartData = series.map((s, idx) => {
      const isSeeded = s.isSynthesized;
      // Use short month format for first/last labels (e.g., "Jul", "Dec")
      const dateLabel = new Date(s.date).toLocaleDateString("en-US", { month: "short" });

      return {
        value: s.value,
        // Only show labels for first/last points
        label: idx === 0 || idx === series.length - 1 ? dateLabel : "",
        date: s.date, // Store for click handler
        isSynthesized: isSeeded, // Store for tooltip
        // Hide dots for seeded data - just show a line
        hideDataPoint: isSeeded,
      };
    });

    // Calculate min/max for proper Y-axis scaling
    const values = series.map((s) => s.value);
    const minVal = values.length > 0 ? Math.min(...values) : 0;
    const maxVal = values.length > 0 ? Math.max(...values) : 10;

    // Floor and ceiling with padding
    const yMin = Math.max(0, Math.floor(minVal) - 1);
    const yMax = Math.ceil(maxVal) + 1;

    // Calculate Low Water Mark from the FILTERED data only
    const lowVal = values.length > 0 ? Math.min(...values) : null;

    return {
      chartData: chartData.length > 0 ? chartData : null,
      chartSeries: series,
      lowWaterMark: lowVal,
      yMin,
      yMax,
    };
  }, [history, timeRange]);

  const title = details?.isProvisional
    ? "Provisional Index"
    : "Official Scandicap";

  const subtitle = useMemo(() => {
    if (!details) return "";
    if (details.roundsCount === 0) {
      return "Play your first round to establish a Scandicap index.";
    }
    if (details.isProvisional) {
      return "Estimate based on limited play history.";
    }
    if (details.roundsCount < 20) {
      return "Official index—maturing toward best 8 of 20.";
    }
    return "Fully established index using best 8 of 20.";
  }, [details]);

  const howItWorksText = useMemo(() => {
    if (!details) return "";
    if (details.roundsCount === 0) {
      return "Once you play and save a round, Scandicap will calculate an estimated handicap based on your scoring versus course difficulty.";
    }
    if (details.isProvisional) {
      return "This is a provisional estimate based on your first few differentials. After 3 rounds, your Scandicap becomes official and continues to refine as you play more.";
    }
    if (details.roundsCount < 20) {
      return "You now have an official Scandicap. As you add rounds, the calculation moves toward the standard “best 8 of your last 20” differentials.";
    }
    return "Your Scandicap is fully established. It uses the best 8 differentials from your last 20 rounds to give you a fair, accurate index that reflects your current game.";
  }, [details]);

  const maturityText =
    details && details.roundsCount >= 20
      ? "Fully Mature Index"
      : `Maturity: ${details?.roundsCount ?? 0}/20 rounds`;

  const router = useRouter();

  return (
    <ImageBackground
      source={require("../assets/images/green_texture.png")}
      style={styles.container}
      resizeMode="cover"
    >
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={styles.customHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color="#F5F5DC" strokeWidth={2.5} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scandicap</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* Seed test rounds button */}
          <TouchableOpacity
            onPress={async () => {
              try {
                await seedHandicap({ initialHandicap: 15.0 });
                Alert.alert("Success", "20 ghost rounds seeded at 15.0 handicap.");
              } catch (e) {
                Alert.alert("Error", "Could not seed rounds.");
              }
            }}
          >
            <Plus size={20} color="#F5F5DC" strokeWidth={2} />
          </TouchableOpacity>
          {/* Clear seeded rounds button */}
          <TouchableOpacity
            onPress={async () => {
              try {
                const result = await clearSeededRounds({});
                Alert.alert("Success", `Cleared ${result.deletedRounds} rounds and ${result.deletedScores} scores.`);
              } catch (e) {
                Alert.alert("Error", "Could not clear seeded rounds.");
              }
            }}
          >
            <Trash2 size={18} color="#F5F5DC" strokeWidth={2} />
          </TouchableOpacity>
          {/* Refresh button */}
          <TouchableOpacity
            onPress={async () => {
              try {
                await rebuildHistory({});
                Alert.alert("Success", "History rebuilt.");
              } catch (e) {
                Alert.alert("Error", "Could not rebuild history.");
              }
            }}
          >
            <RefreshCw size={18} color="#F5F5DC" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={ANTIQUE_GOLD} />
          <Text style={styles.loadingText}>Loading Scandicap…</Text>
        </View>
      )}

      {!loading && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.contentContainer}>
          {/* HERO SECTION */}
          <View style={styles.heroSection}>
            {/* HERO CARD with Gold Texture Border */}
            <ImageBackground
              source={require("../assets/images/gold_texture.png")}
              style={styles.cardBorderContainer}
              imageStyle={{ borderRadius: 18 }}
              resizeMode="cover"
            >
              <ImageBackground
                source={require("../assets/images/paper_texture.png")}
                style={styles.heroCard}
                imageStyle={{ borderRadius: 16 }}
                resizeMode="cover"
              >
                <View style={styles.paperContent}>
                  <View style={styles.heroHeaderRow}>
                    <View>
                      <Text style={styles.appName}>ScanCaddie</Text>
                      <Text style={styles.heroLabel}>OFFICIAL INDEX</Text>
                    </View>
                    {/* Interactive Status Badge */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={{ overflow: 'visible' }} // Allow icon to pop out
                      onPress={() => {
                        if (details?.roundsCount && details.roundsCount >= 3) {
                          Alert.alert(
                            "Official Status: Established",
                            "You have played 3 or more rounds. This index is officially valid for handicap purposes and fair play."
                          );
                        } else {
                          Alert.alert(
                            "Status: Provisional",
                            "You have played fewer than 3 rounds. This index is an estimate. Play more rounds to unlock your official Established status."
                          );
                        }
                      }}
                    >
                      {details?.roundsCount && details.roundsCount >= 3 ? (
                        <>
                          <ImageBackground
                            source={require("../assets/images/gold_texture.png")}
                            style={styles.statusPill}
                            imageStyle={{ borderRadius: 6 }}
                            resizeMode="cover"
                          >
                            <Text style={[styles.statusPillText, styles.statusPillTextEstablished]}>
                              ESTABLISHED
                            </Text>
                          </ImageBackground>
                          <View style={[styles.badgeInfoIcon, { backgroundColor: ANTIQUE_GOLD, borderColor: "#B8B28A" }]}>
                            <Info size={10} color="#3E2723" strokeWidth={2.5} />
                          </View>
                        </>
                      ) : (
                        <>
                          <LinearGradient
                            colors={["#E8E8E8", "#C0C0C0", "#D8D8D8", "#A8A8A8"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statusPill, styles.statusPillProvisionalBorder]}
                          >
                            <Text style={[styles.statusPillText, styles.statusPillTextProvisional]}>
                              PROVISIONAL
                            </Text>
                          </LinearGradient>
                          <LinearGradient
                            colors={["#E8E8E8", "#C0C0C0", "#D8D8D8", "#A8A8A8"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.badgeInfoIcon, { padding: 0 }]}
                          >
                            <Info size={10} color="#555" strokeWidth={2.5} />
                          </LinearGradient>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  <View style={styles.heroValueRow}>
                    <Text style={styles.heroValue}>
                      {details?.currentHandicap != null
                        ? details.currentHandicap.toFixed(1)
                        : "-"}
                    </Text>
                    <View style={styles.heroMeta}>
                      <View style={styles.heroMetaRow}>
                        <Clock size={15} color={DEEP_TEXT} strokeWidth={2.5} opacity={1} />
                        <Text style={styles.heroMetaText}>
                          {details?.roundsCount ?? 0} rounds in window
                        </Text>
                      </View>
                      <Text style={styles.heroSubtitle}>
                        {details?.roundsCount === 0
                          ? "Play your first round to establish a Scandicap index."
                          : "Play consistent golf to improve your index."}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.maturityRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {details && details.roundsCount >= 20 && (
                          <CheckCircle2 size={16} color={ANTIQUE_GOLD} />
                        )}
                        <Text style={styles.maturityLabel}>{maturityText}</Text>
                      </View>
                      <View style={styles.maturityBarTrack}>
                        <ImageBackground
                          source={require("../assets/images/gold_texture.png")}
                          style={[
                            styles.maturityBarFill,
                            {
                              width: `${Math.min(details?.roundsCount ?? 0, 20) / 20 * 100}%`,
                            },
                          ]}
                          imageStyle={{ borderRadius: 999 }}
                          resizeMode="cover"
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </ImageBackground>
            </ImageBackground>

            {/* CHART SECTION */}
            <View style={styles.trendContainer}>
              <View style={styles.sectionHeaderRow}>
                <TrendingUp size={18} color={ANTIQUE_GOLD} strokeWidth={2.5} />
                <Text style={styles.trendTitle}>Index Trend</Text>
              </View>

              {/* Filter Chips - Show always */}
              <View style={{ flexDirection: "row", marginBottom: 16 }}>
                {(["1M", "3M", "6M", "1Y", "All"] as const).map((range) => (
                  <TouchableOpacity
                    key={range}
                    onPress={() => setTimeRange(range)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 12,
                      backgroundColor: timeRange === range ? ANTIQUE_GOLD : "rgba(255,255,255,0.1)",
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: timeRange === range ? "#3E2723" : "#E1F2EA",
                      }}
                    >
                      {range}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Interaction Value Display */}
              {activePoint && (
                <View style={{ position: "absolute", top: 10, right: 0, alignItems: "flex-end" }}>
                  <Text style={{ color: ANTIQUE_GOLD, fontWeight: "700", fontSize: 16 }}>
                    {activePoint.value.toFixed(1)}
                  </Text>
                  <Text style={{ color: "#E1F2EA", fontSize: 12 }}>{activePoint.label}</Text>
                </View>
              )}

              {chartData && hasHistory ? (
                <View style={{ marginLeft: -10, marginRight: -10 }}>
                  <LineChart
                    data={chartData}
                    width={width - 70}
                    height={200}
                    // Y-axis configuration - simple approach
                    noOfSections={3}
                    // Line styling - cream colored thick line with bezier
                    curved
                    color="#F3EAC2"
                    thickness={8}
                    // Area fill - green gradient
                    areaChart
                    startFillColor="#769366"
                    endFillColor="#769366"
                    startOpacity={0.8}
                    endOpacity={0.3}
                    // Data points - cream colored dots
                    dataPointsColor="#F3EAC2"
                    dataPointsRadius={6}
                    // Y-axis styling
                    yAxisColor="transparent"
                    yAxisTextStyle={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 11 }}
                    yAxisLabelSuffix=""
                    formatYLabel={(val: string) => {
                      const num = Number(val);
                      return Number.isInteger(num) ? String(num) : num.toFixed(1);
                    }}
                    // X-axis styling
                    xAxisColor="transparent"
                    xAxisLabelTextStyle={{ color: "rgba(255, 255, 255, 0.7)", fontSize: 11, width: 50 }}
                    // Hide grid lines
                    hideRules
                    // Disable scrolling
                    disableScroll
                    // Spacing for layout - ensure chart fits within bounds
                    initialSpacing={5}
                    endSpacing={15}
                    spacing={(width - 95) / Math.max(chartData.length - 1, 1)}
                    // Click handler
                    onPress={(item: any, index: number) => {
                      const entry = chartSeries[index];
                      if (!entry) return;
                      // Show "Seeded Index" for synthesized/ghost entries, otherwise show the date
                      const label = entry.isSynthesized
                        ? "Seeded Index"
                        : new Date(entry.date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        );
                      setActivePoint({ label, value: item.value });
                    }}
                  />
                </View>
              ) : (
                <View style={{ minHeight: 220, justifyContent: "center", alignItems: "center" }}>
                  <Text style={[styles.chartPlaceholderLight, { textAlign: 'center', opacity: 0.7, fontStyle: "italic" }]}>
                    Play a few rounds to see how your Scandicap evolves over time.
                  </Text>
                </View>
              )}
              {lowWaterMark != null && hasHistory && (
                <Text style={[styles.lowWaterText, { marginTop: 16, marginBottom: 10, color: "#EFEDDF" }]}>
                  Low water mark this period: {lowWaterMark.toFixed(1)}
                </Text>
              )}
            </View>
          </View>

          {/* LOWER PAPER SECTION with Gold Border */}
          <ImageBackground
            source={require("../assets/images/gold_texture.png")}
            style={styles.cardBorderContainer}
            imageStyle={{ borderRadius: 22 }}
            resizeMode="cover"
          >
            <ImageBackground
              source={require("../assets/images/paper_texture.png")}
              style={styles.paperSheet}
              imageStyle={{ borderRadius: 20 }}
              resizeMode="cover"
            >
              {/* How it works */}
              <View style={styles.sheetSection}>
                <TouchableOpacity
                  style={styles.sectionHeaderRow}
                  activeOpacity={0.8}
                  onPress={() => setHowExpanded((prev) => !prev)}
                >
                  <Info size={18} color={DEEP_TEXT} strokeWidth={2.5} />
                  <Text style={styles.sheetSectionTitle}>How Scandicap Works</Text>
                  <View style={styles.howChevron}>
                    {howExpanded ? (
                      <ChevronUp size={18} color={DEEP_TEXT} strokeWidth={2.5} />
                    ) : (
                      <ChevronDown size={18} color={DEEP_TEXT} strokeWidth={2.5} />
                    )}
                  </View>
                </TouchableOpacity>
                {/* Content... */}
                <Text style={styles.sheetBodyText}>
                  {howExpanded ? howItWorksText : subtitle}
                </Text>
              </View>

              {/* Calculation rounds */}
              <View style={[styles.sheetSection, { marginTop: 20 }]}>
                <View style={styles.sectionHeaderRow}>
                  <History size={18} color={DEEP_TEXT} strokeWidth={2.5} />
                  <Text style={styles.sheetSectionTitle}>Calculation History</Text>
                </View>

                {!details?.calculationRounds?.length && (
                  <Text style={styles.sheetSubText}>
                    Once you have rounds with Scandicap differentials, they'll show up here with which ones were used in your index.
                  </Text>
                )}

                {details?.calculationRounds?.length ? (() => {
                  // Cap at 20 most recent rounds (WHS uses last 20)
                  const allRounds = details.calculationRounds.slice(0, 20);

                  // Separate real rounds from synthesized ones
                  const realRounds = allRounds.filter((e: any) => !e.isSynthesized);
                  const synthesizedRounds = allRounds.filter((e: any) => e.isSynthesized);

                  // Create consolidated imported entry if there are synthesized rounds
                  const importedEntry = synthesizedRounds.length > 0 ? {
                    id: "imported-handicap",
                    courseName: "Imported Handicap Index",
                    // Use the most recent synthesized date as "import date"
                    date: synthesizedRounds.reduce((latest: string, e: any) =>
                      e.date > latest ? e.date : latest, synthesizedRounds[0].date),
                    differential: synthesizedRounds[0].differential,
                    usedInCalculation: synthesizedRounds.some((e: any) => e.usedInCalculation),
                    isSynthesized: true,
                    roundCount: synthesizedRounds.length,
                  } : null;

                  return (
                    <View style={{ marginTop: 12 }}>
                      {/* Description */}
                      <Text style={[styles.sheetSubText, { marginBottom: 12 }]}>
                        {"Your last 20 rounds are shown below. Filled badges indicate rounds used in your current index calculation (best differentials are selected)."}
                      </Text>

                      {/* Real rounds first */}
                      {realRounds.map((entry: any) => (
                        <View
                          key={entry.id}
                          style={[
                            styles.roundRow,
                            entry.usedInCalculation && styles.roundRowActive,
                          ]}
                        >
                          <View style={styles.roundMainCol}>
                            <View style={styles.roundCourseRow}>
                              <Text style={styles.roundCourseName}>
                                {entry.courseName}
                              </Text>
                            </View>
                            <Text style={styles.roundMetaText}>
                              {new Date(entry.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                          <View style={styles.roundRightCol}>
                            <View
                              style={[
                                styles.diffPill,
                                entry.usedInCalculation
                                  ? styles.diffPillUsed
                                  : styles.diffPillUnused,
                              ]}
                            >
                              <Text
                                style={
                                  entry.usedInCalculation
                                    ? styles.diffPillTextUsed
                                    : styles.diffPillTextUnused
                                }
                              >
                                {entry.differential.toFixed(1)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      ))}

                      {/* Single consolidated imported entry */}
                      {importedEntry && (
                        <View
                          style={[
                            styles.roundRow,
                            importedEntry.usedInCalculation && styles.roundRowActive,
                          ]}
                        >
                          <View style={styles.roundMainCol}>
                            <View style={styles.roundCourseRow}>
                              <Text style={styles.roundCourseName}>
                                {importedEntry.courseName}
                              </Text>
                              <CloudDownload
                                size={12}
                                color={DEEP_TEXT}
                                style={{ marginLeft: 6, opacity: 0.6 }}
                              />
                            </View>
                            <Text style={styles.roundMetaText}>
                              {new Date(importedEntry.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                              {"  •  "}
                              {importedEntry.roundCount} seeded rounds
                            </Text>
                          </View>
                          <View style={styles.roundRightCol}>
                            <View
                              style={[
                                styles.diffPill,
                                importedEntry.usedInCalculation
                                  ? styles.diffPillUsed
                                  : styles.diffPillUnused,
                                styles.diffPillSynthesized,
                              ]}
                            >
                              <Text
                                style={
                                  importedEntry.usedInCalculation
                                    ? styles.diffPillTextUsed
                                    : styles.diffPillTextUnused
                                }
                              >
                                {importedEntry.differential.toFixed(1)}
                              </Text>
                            </View>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })() : null}
              </View>
            </ImageBackground>
          </ImageBackground>

        </ScrollView>
      )
      }
    </ImageBackground >
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: "#0A261C", // Fallback color matching the texture
  },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 70, // Lowered further
    paddingHorizontal: 16,
    paddingBottom: 25, // Reduced spacing
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButtonText: {
    color: "#F5F5DC",
    fontSize: 17,
    marginLeft: 4,
  },
  headerTitle: {
    color: "#F5F5DC",
    fontSize: 17,
    fontWeight: "600",
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  scroll: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    color: WHITE_MIST,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },

  // HERO CARD
  heroSection: {
    marginBottom: 24,
  },
  cardBorderContainer: {
    borderRadius: 24,
    marginBottom: 20,
    padding: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    overflow: 'hidden',
  },
  heroCard: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  paperContent: {
    padding: 16,
    paddingVertical: 18,
  },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  appName: {
    fontSize: 16,
    fontWeight: "800",
    color: DEEP_TEXT,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    letterSpacing: 0.2,
  },
  heroLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.5, // Significantly increased
    color: DEEP_TEXT,
    opacity: 0.9,
    textTransform: "uppercase",
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    flexDirection: "row", // Added row layout for icon
    alignItems: "center",
    justifyContent: "center",
  },
  statusPillEstablished: {
    backgroundColor: ANTIQUE_GOLD,
  },
  statusPillProvisional: {
    backgroundColor: "#C0C0C0", // Silver/Grey
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  statusPillTextEstablished: {
    color: "#3E2723", // Darker brown text
  },
  statusPillTextProvisional: {
    color: DEEP_TEXT,
  },
  statusPillProvisionalBorder: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#999",
  },
  badgeInfoIcon: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FFF",
    borderRadius: 12,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CCC",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 4, // Reduced spacing
  },
  heroValue: {
    fontSize: 72,
    lineHeight: 72,
    fontWeight: "800",
    color: DEEP_TEXT,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    minWidth: 85, // Stabilize layout for placeholder
    textAlign: "center",
  },
  heroMeta: {
    flex: 1,
    marginLeft: 20,
    paddingBottom: 6,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  heroMetaText: {
    marginLeft: 6,
    fontSize: 13,
    color: DEEP_TEXT,
    fontWeight: "700", // Heavier weight
    opacity: 1,
  },
  heroSubtitle: {
    fontSize: 13,
    color: DEEP_TEXT,
    fontWeight: "500", // Slightly heavier
    lineHeight: 18,
  },
  maturityRow: {
    marginTop: 8,
  },
  maturityLabel: {
    fontSize: 12,
    color: DEEP_TEXT,
    opacity: 0.7,
    marginBottom: 4,
  },
  maturityBarTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.2)", // 20% Black (Transparent Grey)
    overflow: "hidden",
  },
  maturityBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: ANTIQUE_GOLD,
  },
  maturityBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  maturityBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    color: DEEP_TEXT,
    fontWeight: "600",
  },

  // CHART
  trendContainer: {
    paddingHorizontal: 4,
    marginBottom: 0,
  },
  trendTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#F0EAD6", // Cream/Eggshell matching reference
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  chart: {
    marginTop: 12,
    borderRadius: 12,
  },
  chartPlaceholderLight: {
    marginTop: 8,
    fontSize: 13,
    color: WHITE_MIST,
    opacity: 0.7,
    fontStyle: 'italic',
  },
  chartTooltip: {
    position: 'absolute',
    top: 40,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: PAPER_BG_DARK,
    borderWidth: 1,
    borderColor: ANTIQUE_GOLD,
    zIndex: 10,
  },
  chartTooltipText: {
    fontSize: 12,
    fontWeight: '600',
    color: DEEP_TEXT,
  },
  lowWaterText: {
    marginTop: 8,
    fontSize: 12,
    color: WHITE_MIST,
    opacity: 0.6,
  },

  // BOTTOM SHEET / PAPER
  paperSheet: {
    padding: 20,
    paddingBottom: 10,
  },
  sheetSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetSectionTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: DEEP_TEXT,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
  },
  sheetBodyText: {
    fontSize: 14,
    color: DEEP_TEXT,
    lineHeight: 22,
    opacity: 0.9,
  },
  sheetSubText: {
    fontSize: 13,
    color: DEEP_TEXT,
    opacity: 0.7,
    marginBottom: 8,
    lineHeight: 18,
  },
  howChevron: {
    marginLeft: "auto",
  },
  roundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#D6C6A0",
    borderStyle: "dashed",
  },
  roundRowActive: {
    backgroundColor: "rgba(197, 160, 101, 0.08)", // subtle gold highlight
  },
  roundMainCol: {
    flex: 1,
    marginRight: 8,
  },
  roundCourseRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  roundCourseName: {
    fontSize: 14,
    fontWeight: "700",
    color: DEEP_TEXT,
  },
  roundMetaText: {
    fontSize: 12,
    color: DEEP_TEXT,
    opacity: 0.6,
    marginTop: 2,
  },
  roundRightCol: {
    alignItems: "flex-end",
  },
  diffPill: {
    minWidth: 48,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DEEP_TEXT,
  },
  diffPillUsed: {
    backgroundColor: DEEP_TEXT,
    borderColor: DEEP_TEXT,
  },
  diffPillUnused: {
    backgroundColor: "transparent",
    borderColor: DEEP_TEXT,
    opacity: 0.4,
  },
  diffPillSynthesized: {
    borderStyle: "dashed",
  },
  diffPillTextUsed: {
    fontSize: 13,
    fontWeight: "700",
    color: PAPER_BG_LIGHT,
    fontVariant: ["tabular-nums"],
  },
  diffPillTextUnused: {
    fontSize: 13,
    fontWeight: "600",
    color: DEEP_TEXT,
    fontVariant: ["tabular-nums"],
  },
});

