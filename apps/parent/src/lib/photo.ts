import type * as ImagePickerTypes from 'expo-image-picker';
import { Linking } from 'react-native';
import { api } from './api';

export type PhotoSource = 'camera' | 'library';

/** The parent refused access; `canAskAgain` false means only the phone's settings can grant it now. */
export class PhotoPermissionError extends Error {
  constructor(readonly source: PhotoSource, readonly canAskAgain: boolean) {
    super('permission_denied');
    this.name = 'PhotoPermissionError';
  }
}

export const openSettings = () => Linking.openSettings();

/** Lets the parent take or pick a square photo; null when they cancel. */
export async function pickPhoto(source: PhotoSource): Promise<string | null> {
  // Native camera/gallery modules load on demand, only when the parent changes their photo.
  const ImagePicker = await import('expo-image-picker');
  const permission = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError(source, permission.canAskAgain);
  const options: ImagePickerTypes.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/** 600 px wide JPEG at 70 % quality: a few hundred KB, well under the 2 MB the server accepts. */
export async function compress(uri: string): Promise<string> {
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 600 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return saved.uri;
}

/** Uploads straight to private storage with a short-lived signed link, then makes it the profile photo. */
export async function uploadProfilePhoto(uri: string): Promise<void> {
  const upload = await api.account.photoUploadUrl();
  const file = await fetch(uri);
  const body = await file.blob();
  const response = await fetch(upload.url, { method: upload.method, headers: upload.headers, body });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
  await api.account.setPhoto({ key: upload.key });
}
