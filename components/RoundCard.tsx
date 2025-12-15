import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Round } from '@/types';
import { colors } from '@/constants/colors';
import { Calendar, Users } from 'lucide-react-native';

interface RoundCardProps {
  round: Round;
  onPress: (round: Round) => void;
  highlightPlayerId?: string; // Show this player's score instead of best
}

export const RoundCard: React.FC<RoundCardProps> = ({ round, onPress, highlightPlayerId }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getBestScore = () => {
    if (round.players.length === 0) return null;

    const bestPlayer = round.players.reduce((best, current) =>
      best.totalScore < current.totalScore ? best : current
    );

    return {
      name: bestPlayer.playerName,
      score: bestPlayer.totalScore
    };
  };

  const getHighlightedPlayerScore = () => {
    if (!highlightPlayerId) return null;
    const player = round.players.find(p => p.playerId === highlightPlayerId);
    if (!player) return null;
    return {
      name: player.playerName,
      score: player.totalScore
    };
  };

  const highlightedScore = getHighlightedPlayerScore();
  const bestScore = getBestScore();
  const displayScore = highlightedScore || bestScore;
  const scoreLabel = highlightedScore ? "Score:" : "Best Score:";

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(round)}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.courseName} numberOfLines={1}>{round.courseName}</Text>
        <View style={styles.dateContainer}>
          <Calendar size={14} color={colors.textSecondary} />
          <Text style={styles.date}>{formatDate(round.date)}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.playersContainer}>
          <Users size={16} color={colors.textSecondary} />
          <Text style={styles.playersText}>
            {round.players.length} {round.players.length === 1 ? 'player' : 'players'}
          </Text>
        </View>

        {displayScore && (
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>{scoreLabel}</Text>
            <Text style={styles.scoreValue}>
              {highlightedScore ? displayScore.score : `${displayScore.name}: ${displayScore.score}`}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  courseName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  date: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playersText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 4,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});