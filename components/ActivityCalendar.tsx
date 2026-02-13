import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors } from '@/constants/colors';
import { Info, X } from 'lucide-react-native';
import { useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { extractYmdDate, getLocalDateString, parseLocalDateString } from '@/utils/helpers';
import { useT } from '@/lib/i18n';
import { useOnboardingStore } from '@/store/useOnboardingStore';

interface ActivityCalendarProps {
  year?: number;
}

export const ActivityCalendar: React.FC<ActivityCalendarProps> = ({ year = new Date().getFullYear() }) => {
  const [showInfo, setShowInfo] = useState(false);
  const t = useT();
  const language = useOnboardingStore((s) => s.language);
  const localeForDates = language === "es" ? "es-ES" : "en-US";

  // Fetch only round dates from Convex backend (lightweight query)
  const profile = useQuery(api.users.getProfile);
  const roundDates = useQuery(
    api.rounds.listDatesByHost,
    profile?._id ? { hostId: profile._id as Id<'users'>, year } : "skip"
  ) || [];

  // Get all dates in the year
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Create a map of dates to round counts
  const activityMap = new Map<string, number>();

  roundDates.forEach((dateStr: string) => {
    const ymd = extractYmdDate(dateStr);
    if (!ymd) return;
    const roundDate = parseLocalDateString(ymd);
    if (!roundDate) return;
    if (roundDate.getFullYear() !== year) return;
    const dateKey = getLocalDateString(roundDate);
    activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);
  });

  // Generate all days in the year
  const days: { date: Date; count: number }[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateKey = getLocalDateString(currentDate);
    days.push({
      date: new Date(currentDate),
      count: activityMap.get(dateKey) || 0
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Group days by weeks
  const weeks: { date: Date; count: number }[][] = [];
  let currentWeek: { date: Date; count: number }[] = [];

  // Add empty days at the beginning to align with Sunday
  const firstDayOfWeek = days[0].date.getDay();
  for (let i = 0; i < firstDayOfWeek; i++) {
    currentWeek.push({ date: new Date(0), count: -1 }); // -1 indicates empty
  }

  days.forEach(day => {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  // Add remaining days to last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: new Date(0), count: -1 });
    }
    weeks.push(currentWeek);
  }

  const getActivityColor = (count: number) => {
    if (count === -1) return 'transparent'; // Empty day
    if (count === 0) return colors.border;
    if (count === 1) return '#9be9a8';
    if (count === 2) return '#40c463';
    if (count >= 3) return '#30a14e';
    return '#216e39';
  };

  const months = Array.from({ length: 12 }, (_, idx) =>
    new Date(2000, idx, 1).toLocaleString(localeForDates, { month: 'short' })
  );

  const weekdays = language === "es" ? ['D', 'L', 'M', 'X', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{t("Activity")}</Text>
        <TouchableOpacity
          style={styles.infoButton}
          onPress={() => setShowInfo(true)}
        >
          <Info size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.calendarContainer}>
        {/* Month labels */}
        <View style={styles.monthsRow}>
          <View style={styles.weekdayLabel} />
          {months.map((month, index) => (
            <Text key={month} style={styles.monthLabel}>
              {month}
            </Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {/* Weekday labels */}
          <View style={styles.weekdaysColumn}>
            {weekdays.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekdayLabel}>
                {index % 2 === 1 ? day : ''}
              </Text>
            ))}
          </View>

          {/* Activity squares */}
          <View style={styles.weeksContainer}>
            {weeks.map((week, weekIndex) => (
              <View key={weekIndex} style={styles.week}>
                {week.map((day, dayIndex) => (
                  <View
                    key={`${weekIndex}-${dayIndex}`}
                    style={[
                      styles.daySquare,
                      { backgroundColor: getActivityColor(day.count) }
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Info Modal */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("Activity Calendar")}</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowInfo(false)}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalText}>
              {t("This calendar shows your golf activity throughout the year. Each square represents a day:")}
            </Text>

            <View style={styles.modalLegend}>
              <View style={styles.modalLegendItem}>
                <View style={[styles.modalLegendSquare, { backgroundColor: colors.border }]} />
                <Text style={styles.modalLegendText}>{t("No rounds played")}</Text>
              </View>
              <View style={styles.modalLegendItem}>
                <View style={[styles.modalLegendSquare, { backgroundColor: '#9be9a8' }]} />
                <Text style={styles.modalLegendText}>{t("1 round played")}</Text>
              </View>
              <View style={styles.modalLegendItem}>
                <View style={[styles.modalLegendSquare, { backgroundColor: '#40c463' }]} />
                <Text style={styles.modalLegendText}>{t("2 rounds played")}</Text>
              </View>
              <View style={styles.modalLegendItem}>
                <View style={[styles.modalLegendSquare, { backgroundColor: '#30a14e' }]} />
                <Text style={styles.modalLegendText}>{t("3+ rounds played")}</Text>
              </View>
            </View>

            <Text style={styles.modalFooterText}>
              {t("The more you play, the more filled out your calendar becomes!")}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 8,
  },
  infoButton: {
    padding: 4,
  },
  calendarContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  monthsRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  monthLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    flex: 1,
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
  },
  weekdaysColumn: {
    marginRight: 8,
  },
  weekdayLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    height: 12,
    width: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  weeksContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  week: {
    flex: 1,
    marginRight: 2,
  },
  daySquare: {
    width: '100%',
    height: 10,
    borderRadius: 2,
    marginBottom: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalLegend: {
    marginBottom: 16,
  },
  modalLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalLegendSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 12,
  },
  modalLegendText: {
    fontSize: 14,
    color: colors.text,
  },
  modalFooterText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
