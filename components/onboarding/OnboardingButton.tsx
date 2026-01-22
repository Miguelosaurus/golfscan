import React from 'react';
import {
    TouchableOpacity,
    Text,
    StyleSheet,
    ActivityIndicator,
    ViewStyle,
    View,
} from 'react-native';
import { colors } from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';

interface OnboardingButtonProps {
    title: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'ghost';
    disabled?: boolean;
    loading?: boolean;
    style?: ViewStyle;
    icon?: React.ReactNode;
}

export const OnboardingButton: React.FC<OnboardingButtonProps> = ({
    title,
    onPress,
    variant = 'primary',
    disabled = false,
    loading = false,
    style,
    icon,
}) => {
    const isPrimary = variant === 'primary';
    const isSecondary = variant === 'secondary';
    const isGhost = variant === 'ghost';

    if (isPrimary) {
        return (
            <TouchableOpacity
                onPress={onPress}
                disabled={disabled || loading}
                activeOpacity={0.85}
                style={[styles.buttonWrapper, style]}
            >
                <LinearGradient
                    colors={disabled ? ['#CCCCCC', '#AAAAAA'] : ['#FC661A', '#E55A15']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradientButton}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                        <View style={styles.buttonContent}>
                            {icon}
                            <Text style={styles.primaryText}>{title}</Text>
                        </View>
                    )}
                </LinearGradient>
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            style={[
                styles.button,
                isSecondary && styles.secondaryButton,
                isGhost && styles.ghostButton,
                disabled && styles.buttonDisabled,
                style,
            ]}
            onPress={onPress}
            disabled={disabled || loading}
            activeOpacity={0.8}
        >
            {loading ? (
                <ActivityIndicator
                    color={isSecondary ? colors.primary : colors.textSecondary}
                    size="small"
                />
            ) : (
                <View style={styles.buttonContent}>
                    {icon}
                    <Text
                        style={[
                            styles.buttonText,
                            isSecondary && styles.secondaryText,
                            isGhost && styles.ghostText,
                        ]}
                    >
                        {title}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    buttonWrapper: {
        borderRadius: 28,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    gradientButton: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    button: {
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButton: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: colors.primary,
    },
    ghostButton: {
        backgroundColor: 'transparent',
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonText: {
        fontSize: 17,
        fontWeight: '600',
    },
    primaryText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '700',
    },
    secondaryText: {
        color: colors.primary,
    },
    ghostText: {
        color: colors.textSecondary,
        fontSize: 15,
    },
});
