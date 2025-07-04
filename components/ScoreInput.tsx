import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { colors } from '@/constants/colors';
import { Hole } from '@/types';

interface ScoreInputProps {
  hole: Hole;
  playerName: string;
  initialValue?: number;
  onScoreChange: (holeNumber: number, score: number) => void;
}

export const ScoreInput: React.FC<ScoreInputProps> = ({
  hole,
  playerName,
  initialValue,
  onScoreChange
}) => {
  const [score, setScore] = useState(initialValue?.toString() || '');
  
  const handleScoreChange = (value: string) => {
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setScore(value);
      if (value) {
        onScoreChange(hole.number, parseInt(value, 10));
      }
    }
  };
  
  const getScoreColor = () => {
    if (!score) return colors.text;
    
    const scoreNum = parseInt(score, 10);
    if (scoreNum < hole.par) return colors.success;
    if (scoreNum === hole.par) return colors.text;
    return colors.error;
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.holeInfo}>
        <Text style={styles.holeNumber}>Hole {hole.number}</Text>
        <Text style={styles.holePar}>Par {hole.par}</Text>
      </View>
      
      <View style={styles.scoreContainer}>
        <Text style={styles.playerName} numberOfLines={1}>{playerName}</Text>
        <TextInput
          style={[styles.scoreInput, { color: getScoreColor() }]}
          value={score}
          onChangeText={handleScoreChange}
          keyboardType="number-pad"
          maxLength={2}
          placeholder="-"
          placeholderTextColor={colors.inactive}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  holeInfo: {
    flex: 1,
  },
  holeNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  holePar: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 16,
    color: colors.text,
    marginRight: 12,
    maxWidth: 100,
  },
  scoreInput: {
    width: 50,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
});