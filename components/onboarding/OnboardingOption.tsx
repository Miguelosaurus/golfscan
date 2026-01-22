import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    View,
    ViewStyle,
    Animated,
} from 'react-native';
import { colors } from '@/constants/colors';
import { Check } from 'lucide-react-native';

interface OnboardingOptionProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    selected?: boolean;
    onPress: () => void;
    style?: ViewStyle;
}

export const OnboardingOption: React.FC<OnboardingOptionProps> = ({
    title,
    subtitle,
    icon,
    selected = false,
    onPress,
    style,
}) => {
    return (
        <TouchableOpacity
            style={[
                styles.container,
                selected && styles.containerSelected,
                style,
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            {icon && <View style={styles.iconContainer}>{icon}</View>}

            <View style={styles.content}>
                <Text style={[styles.title, selected && styles.titleSelected]}>
                    {title}
                </Text>
                {subtitle && (
                    <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>
                        {subtitle}
                    </Text>
                )}
            </View>

            {selected && (
                <View style={styles.checkContainer}>
                    <Check size={20} color="#FFFFFF" strokeWidth={3} />
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        borderWidth: 2,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    containerSelected: {
        borderColor: colors.primary,
        backgroundColor: '#FFF8F5',
    },
    iconContainer: {
        marginRight: 14,
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: colors.text,
    },
    titleSelected: {
        color: colors.primary,
    },
    subtitle: {
        fontSize: 14,
        color: colors.textSecondary,
        marginTop: 4,
        lineHeight: 20,
    },
    subtitleSelected: {
        color: colors.text,
        opacity: 0.7,
    },
    checkContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 12,
    },
});
