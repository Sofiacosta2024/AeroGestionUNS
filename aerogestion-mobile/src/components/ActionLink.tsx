import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { theme } from '@/lib/theme';

type ActionLinkProps = {
  href: Href;
  title: string;
  description: string;
};

export function ActionLink({ href, title, description }: ActionLinkProps) {
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    marginBottom: 12,
    padding: 18,
  },
  pressed: {
    opacity: 0.72,
  },
  title: {
    color: theme.colors.brand,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 5,
  },
  description: {
    color: theme.colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
