import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';

function TabIcon({ name, color, size }: { name: 'home' | 'flights' | 'tickets' | 'notifications'; color: ColorValue; size: number }) {
  if (name === 'flights') {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" accessibilityLabel="Vuelos">
        <Path d="M9 20.5L25.5 12L21 21.5L29 27L24 28L18 24.5L14 28.5L13.5 24L9 20.5Z" fill={color} />
        <Circle cx="28.5" cy="13.5" r="2.8" fill={color} />
      </Svg>
    );
  }

  if (name === 'tickets') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Pasajes">
        <Path d="M4 6.5h16a1.5 1.5 0 0 1 1.5 1.5v2.1a2.1 2.1 0 0 0 0 3.8V16a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16v-2.1a2.1 2.1 0 0 0 0-3.8V8A1.5 1.5 0 0 1 4 6.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M14.5 7.5v2m0 2v2m0 2v1" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeDasharray="0.5 1.5" />
      </Svg>
    );
  }

  if (name === 'notifications') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Notificaciones">
        <Path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M10 21h4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx="18" cy="5" r="2" fill={color} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityLabel="Inicio">
      <Path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2v-9Z" fill={color} />
    </Svg>
  );
}

export default function PassengerTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="flights" options={{ title: 'Vuelos', tabBarIcon: ({ color, size }) => <TabIcon name="flights" color={color} size={size} /> }} />
      <Tabs.Screen name="tickets" options={{ title: 'Pasajes', tabBarIcon: ({ color, size }) => <TabIcon name="tickets" color={color} size={size} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Avisos', tabBarIcon: ({ color, size }) => <TabIcon name="notifications" color={color} size={size} /> }} />
    </Tabs>
  );
}
