import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';

type ScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  compact?: boolean;
  headerTitle?: string;
  headerBadge?: string;
};

export function Screen({ eyebrow, title, description, children, compact = false, headerTitle, headerBadge }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {compact ? (
        <View style={styles.compactHeader}>
          <Text numberOfLines={1} style={styles.compactHeaderTitle}>{headerTitle ?? `AeroGestión · ${eyebrow}`}</Text>
          {headerBadge && <Text style={styles.headerBadge}>{headerBadge}</Text>}
        </View>
      ) : (
        <View style={styles.brandHeader}>
          <View style={styles.brandMark}>
            <Image
              accessibilityLabel="Logo AeroGestión UNS"
              resizeMode="contain"
              source={require('../../assets/brand-mark.png')}
              style={styles.brandMarkImage}
            />
          </View>
          <View>
            <Text style={styles.brandName}>AeroGestión <Text style={styles.brandAccent}>UNS</Text></Text>
            <Text style={styles.brandCaption}>PORTAL DE PASAJEROS</Text>
          </View>
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, compact && styles.compactContent]}>
        {!compact && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        {!compact && <Text style={styles.title}>{title}</Text>}
        {!compact && <Text style={styles.description}>{description}</Text>}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.brand,
    flex: 1,
  },
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  compactHeader: {
    alignItems: 'center',
    backgroundColor: theme.colors.brand,
    flexDirection: 'row',
    gap: 8,
    height: 54,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  compactHeaderTitle: { color: '#FFFFFF', flex: 1, fontSize: 13, fontWeight: '700' },
  headerBadge: { backgroundColor: '#FFE1E8', borderRadius: 9, color: theme.colors.danger, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: theme.colors.brandDark,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  brandMarkImage: { width: 30, height: 30 },
  brandName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  brandAccent: {
    color: '#FFB3B6',
  },
  brandCaption: {
    color: '#D1BCFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  scroll: {
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
  },
  compactContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    color: theme.colors.brand,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: -0.7,
    lineHeight: 32,
    marginBottom: 12,
  },
  description: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
    maxWidth: 420,
  },
});
