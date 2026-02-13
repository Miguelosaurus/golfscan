import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { colors } from '@/constants/colors';
import { ScoreTrendData } from '@/utils/stats';
import { useT } from '@/lib/i18n';

interface ScoreTrendCardProps {
  data: ScoreTrendData;
}

export const ScoreTrendCard = ({ data }: ScoreTrendCardProps) => {
  const t = useT();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - 48, 280);
  const hasEnoughData = data.totalRounds >= 2 && data.scores.length >= 2;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>▼ {t('Score Trend')}</Text>
      {hasEnoughData ? (
        <View style={styles.chartWrapper}>
          <LineChart
            data={{
              labels: data.labels,
              datasets: [
                {
                  data: data.scores,
                  color: (opacity = 1) => `rgba(252, 102, 26, ${opacity})`,
                  strokeWidth: 3,
                },
                {
                  data: data.movingAverage,
                  color: (opacity = 1) => `rgba(30, 96, 89, ${opacity})`,
                  strokeWidth: 2,
                },
              ],
              legend: [t('Score'), t('5-Round Avg')],
            }}
            width={chartWidth}
            height={220}
            chartConfig={{
              backgroundGradientFrom: colors.card,
              backgroundGradientTo: colors.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(30, 96, 89, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(30, 96, 89, ${opacity})`,
              propsForDots: {
                r: '4',
                strokeWidth: '1',
                stroke: colors.background,
              },
              propsForBackgroundLines: {
                stroke: colors.border,
                strokeDasharray: '',
              },
            }}
            bezier
            withShadow={false}
            withVerticalLines={false}
            withHorizontalLines
            style={styles.chart}
          />
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {t('Play a few more rounds to see your scoring trend.')}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  chartWrapper: {
    alignItems: 'center',
  },
  chart: {
    borderRadius: 12,
  },
  placeholder: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.text,
    opacity: 0.7,
    textAlign: 'center',
  },
});
