import { ActionLink } from '@/components/ActionLink';
import { Screen } from '@/components/Screen';
import { useSignIn } from '@clerk/expo';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '@/lib/theme';

type VerificationMethod = 'email_code' | 'totp';

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { fetchStatus, signIn } = useSignIn();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function activateSession() {
    const { error } = await signIn.finalize();
    if (error) {
      setMessage(error.longMessage ?? 'No se pudo activar la sesión.');
      return;
    }
    const destination = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo as Href
      : '/';
    router.replace(destination);
  }

  async function handleSignIn() {
    if (!emailAddress.trim() || !password) return;

    setIsSubmitting(true);
    setMessage(null);
    try {
      const { error } = await signIn.password({
        emailAddress: emailAddress.trim(),
        password,
      });

      if (error) {
        setMessage(error.longMessage ?? 'No se pudo iniciar sesión. Revisá los datos e intentá de nuevo.');
        return;
      }

      if (signIn.status === 'complete') {
        await activateSession();
        return;
      }

      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const factors = signIn.supportedSecondFactors;
        if (factors.some((factor) => factor.strategy === 'email_code')) {
          const { error: codeError } = await signIn.mfa.sendEmailCode();
          if (codeError) {
            setMessage(codeError.longMessage ?? 'No se pudo enviar el código de verificación.');
            return;
          }
          setVerificationMethod('email_code');
          setMessage('Te enviamos un código por correo para verificar este dispositivo.');
          return;
        }
        if (factors.some((factor) => factor.strategy === 'totp')) {
          setVerificationMethod('totp');
          setMessage('Ingresá el código de tu aplicación de autenticación.');
          return;
        }
        setMessage('La cuenta requiere un método de verificación que todavía no está disponible en esta app.');
        return;
      }

      setMessage('La cuenta requiere un paso de autenticación que todavía no está disponible en esta app.');
    } catch {
      setMessage('No pudimos conectarnos con Clerk. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode() {
    if (!verificationMethod || !verificationCode.trim()) return;

    setIsSubmitting(true);
    setMessage(null);
    try {
      const result = verificationMethod === 'email_code'
        ? await signIn.mfa.verifyEmailCode({ code: verificationCode.trim() })
        : await signIn.mfa.verifyTOTP({ code: verificationCode.trim() });

      if (result.error) {
        setMessage(result.error.longMessage ?? 'El código no es válido. Intentá de nuevo.');
        return;
      }
      if (signIn.status === 'complete') {
        await activateSession();
        return;
      }
      setMessage('La verificación necesita otro paso que todavía no está disponible en esta app.');
    } catch {
      setMessage('No pudimos verificar el código. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen
      eyebrow="CUENTA DE PASAJERO"
      title="Iniciar sesión"
      description="Ingresá con tu cuenta para consultar tus reservas."
    >
      <View style={styles.form}>
        {!verificationMethod ? (
          <>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmailAddress}
              placeholder="tu@email.com"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              value={emailAddress}
            />
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="current-password"
              onChangeText={setPassword}
              placeholder="Tu contraseña"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              disabled={fetchStatus === 'fetching' || isSubmitting || !emailAddress.trim() || !password}
              onPress={handleSignIn}
              style={({ pressed }) => [styles.button, (fetchStatus === 'fetching' || isSubmitting || !emailAddress.trim() || !password) && styles.buttonDisabled, pressed && styles.buttonPressed]}
            >
              {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Iniciar sesión</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>
              {verificationMethod === 'email_code' ? 'Código enviado a tu correo' : 'Código de autenticación'}
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="number-pad"
              onChangeText={setVerificationCode}
              placeholder="Ingresá el código"
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              value={verificationCode}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || !verificationCode.trim()}
              onPress={handleVerifyCode}
              style={({ pressed }) => [styles.button, (isSubmitting || !verificationCode.trim()) && styles.buttonDisabled, pressed && styles.buttonPressed]}
            >
              {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verificar</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => { setVerificationMethod(null); setVerificationCode(''); setMessage(null); }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Volver al inicio de sesión</Text>
            </Pressable>
          </>
        )}
        {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      </View>
      <ActionLink href="/" title="Volver al inicio" description="Regresar a la pantalla principal." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    marginBottom: 28,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  button: {
    alignItems: 'center',
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    marginTop: 6,
    minHeight: 50,
    padding: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: theme.colors.brand,
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    color: theme.colors.warning,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
  },
});
