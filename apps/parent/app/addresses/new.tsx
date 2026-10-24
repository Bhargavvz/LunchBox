import { zodResolver } from '@hookform/resolvers/zod';
import { Banner, Button, Chip, IconButton, Row, Screen, SectionHeader, Text, TextField, elevation, mapStyle, useTheme } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { House, LocateFixed } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { z } from 'zod';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

const schema = z.object({
  label: z.string().trim().min(1).max(40),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/),
  instructions: z.string().trim().max(500).optional(),
});
type Form = z.infer<typeof schema>;

const DEFAULT_REGION: Region = { latitude: 12.9716, longitude: 77.5946, latitudeDelta: 0.01, longitudeDelta: 0.01 };
const LABELS = ['home', 'work', 'family'] as const;

/** The pin is fixed at the map centre; the parent drags the map until the pin sits on their door. */
export default function NewAddressScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const style = useMemo(() => mapStyle(theme), [theme]);
  // The pin rises while the map moves and drops back when it settles, so the parent sees exactly where it lands.
  const lift = useRef(new Animated.Value(0)).current;
  const lifted = useRef(false);
  const { control, handleSubmit, setValue, watch, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { label: t('address.labels.home'), line1: '', line2: '', landmark: '', city: '', pincode: '', instructions: '' },
  });
  const label = watch('label');

  const raise = (up: boolean) => {
    if (lifted.current === up) return;
    lifted.current = up;
    Animated.spring(lift, { toValue: up ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: up ? 0 : 10 }).start();
  };

  async function useMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t('address.locationDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next = { ...region, latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 };
      mapRef.current?.animateToRegion(next, 600);
      setRegion(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.addresses.create({
        label: v.label,
        line1: v.line1,
        line2: v.line2 || undefined,
        landmark: v.landmark || undefined,
        city: v.city,
        pincode: v.pincode,
        instructions: v.instructions || undefined,
        location: { lat: region.latitude, lng: region.longitude },
        makeDefault: false,
      });
      await qc.invalidateQueries({ queryKey: ['addresses'] });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  const field = (name: keyof Form, fieldLabel: string, errorText: string, props: object = {}) => (
    <Controller control={control} name={name} render={({ field: f, fieldState }) => (
      <TextField label={fieldLabel} value={f.value ?? ''} onChangeText={f.onChange} onBlur={f.onBlur}
                 error={fieldState.error ? errorText : undefined} {...props} />
    )} />
  );

  return (
    <Screen keyboard footer={<Button title={t('common.save')} size="lg" onPress={submit} loading={formState.isSubmitting} testID="address-save" />}>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <View style={[styles.map, { borderColor: theme.colors.border }]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          customMapStyle={style}
          initialRegion={DEFAULT_REGION}
          onRegionChange={() => raise(true)}
          onRegionChangeComplete={(r) => {
            setRegion(r);
            raise(false);
          }}
          showsUserLocation
          showsMyLocationButton={false}
          toolbarEnabled={false}
          accessibilityLabel={t('address.pin')}
        />
        <View pointerEvents="none" style={styles.pinWrap}>
          <Animated.View style={{ alignItems: 'center',
            transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) }] }}>
            <View style={[styles.pinHead, { backgroundColor: theme.colors.primary, borderColor: theme.colors.surface }, elevation(theme, 2)]}>
              <House size={18} color={theme.colors.onPrimary} strokeWidth={2.2} />
            </View>
            <View style={[styles.pinStem, { backgroundColor: theme.colors.primary }]} />
          </Animated.View>
          <Animated.View style={[styles.pinShadow, { opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.15] }),
            transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] }) }] }]} />
        </View>
        <View style={[styles.hint, { backgroundColor: theme.colors.surface }, elevation(theme, 1)]} pointerEvents="none">
          <Text variant="caption">{t('address.pin')}</Text>
        </View>
        <View style={{ position: 'absolute', right: 12, bottom: 12 }}>
          <IconButton icon={LocateFixed} label={t('address.useLocation')} tone="plain" onPress={() => void useMyLocation()} />
        </View>
      </View>
      {locating ? <Text variant="caption" muted center>{t('address.locating')}</Text> : null}

      <SectionHeader title={t('address.saveAs')} />
      <Row gap={2} wrap>
        {LABELS.map((k) => (
          <Chip key={k} label={t(`address.labels.${k}`)} role="radio" selected={label === t(`address.labels.${k}`)}
                onPress={() => setValue('label', t(`address.labels.${k}`), { shouldValidate: true })} />
        ))}
      </Row>
      {field('label', t('address.label'), t('address.errors.label'))}

      <SectionHeader title={t('address.details')} />
      {field('line1', t('address.line1'), t('address.errors.line1'), { testID: 'address-line1' })}
      {field('line2', t('address.line2'), t('address.errors.line2'))}
      {field('landmark', t('address.landmark'), t('address.errors.landmark'))}
      <Row gap={3} align="flex-start">
        <View style={{ flex: 1.4 }}>{field('city', t('address.city'), t('address.errors.city'), { testID: 'address-city' })}</View>
        <View style={{ flex: 1 }}>
          {field('pincode', t('address.pincode'), t('address.errors.pincode'),
            { keyboardType: 'number-pad', maxLength: 6, testID: 'address-pincode' })}
        </View>
      </Row>
      {field('instructions', t('address.instructions'), t('address.errors.instructions'),
        { multiline: true, maxLength: 500, counter: true, hint: t('address.instructionsHint') })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  map: { height: 280, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  pinWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  pinHead: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginTop: -44 },
  pinStem: { width: 3, height: 12, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  pinShadow: { width: 14, height: 5, borderRadius: 7, backgroundColor: '#000', marginTop: 1 },
  hint: { position: 'absolute', top: 12, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
});
