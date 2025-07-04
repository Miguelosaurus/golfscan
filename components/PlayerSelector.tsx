import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList,
  TextInput
} from 'react-native';
import { colors } from '@/constants/colors';
import { Player } from '@/types';
import { Check, Plus, User } from 'lucide-react-native';

interface PlayerSelectorProps {
  players: Player[];
  selectedPlayers: Player[];
  onSelectPlayer: (player: Player) => void;
  onUnselectPlayer: (playerId: string) => void;
  onAddNewPlayer: (name: string) => void;
}

export const PlayerSelector: React.FC<PlayerSelectorProps> = ({
  players,
  selectedPlayers,
  onSelectPlayer,
  onUnselectPlayer,
  onAddNewPlayer
}) => {
  const [newPlayerName, setNewPlayerName] = useState('');
  
  const isPlayerSelected = (playerId: string) => {
    return selectedPlayers.some(p => p.id === playerId);
  };
  
  const handleAddNewPlayer = () => {
    if (newPlayerName.trim()) {
      onAddNewPlayer(newPlayerName.trim());
      setNewPlayerName('');
    }
  };
  
  const renderPlayerItem = ({ item }: { item: Player }) => {
    const selected = isPlayerSelected(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.playerItem, selected && styles.selectedPlayerItem]}
        onPress={() => selected ? onUnselectPlayer(item.id) : onSelectPlayer(item)}
      >
        <View style={styles.playerInfo}>
          <View style={styles.avatarContainer}>
            {item.photoUrl ? (
              <View style={styles.avatar} />
            ) : (
              <User size={20} color={colors.textSecondary} />
            )}
          </View>
          <Text style={styles.playerName}>{item.name}</Text>
        </View>
        
        {selected && (
          <Check size={20} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Players</Text>
      
      <View style={styles.addPlayerContainer}>
        <TextInput
          style={styles.input}
          value={newPlayerName}
          onChangeText={setNewPlayerName}
          placeholder="Add new player"
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity 
          style={[
            styles.addButton, 
            !newPlayerName.trim() && styles.disabledButton
          ]}
          onPress={handleAddNewPlayer}
          disabled={!newPlayerName.trim()}
        >
          <Plus size={20} color={colors.background} />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={players}
        renderItem={renderPlayerItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.playersList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  addPlayerContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: colors.inactive,
  },
  playersList: {
    paddingBottom: 16,
  },
  playerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedPlayerItem: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  playerName: {
    fontSize: 16,
    color: colors.text,
  },
});