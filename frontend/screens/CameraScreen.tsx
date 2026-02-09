import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography, radii } from '../lib/theme';
import { ScreenContainer, PrimaryButton, Card, StatusChip } from '../components/ui';

interface CameraScreenProps {
  navigation: any;
}

export default function CameraScreen({ navigation }: CameraScreenProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const platform = 'ebay' as const;
  const [brand, setBrand] = useState('');
  const [showHints, setShowHints] = useState(false);

  const pickImage = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limit Reached', 'Maximum 5 photos allowed');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setPhotos([...photos, base64]);
    }
  };

  const takePhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Limit Reached', 'Maximum 5 photos allowed');
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Camera permission is needed');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setPhotos([...photos, base64]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const handleGenerate = () => {
    if (photos.length === 0) {
      Alert.alert('No Photos', 'Please add at least one photo');
      return;
    }

    navigation.navigate('Generating', {
      photos,
      platform,
      userHints: brand ? { brand } : undefined,
    });
  };

  return (
    <ScreenContainer edges={[]} noPadding>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Add Photos</Text>
        <Text style={styles.subtitle}>Take 1-5 photos of your item</Text>

        <View style={styles.photosGrid}>
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoContainer}>
              <Image source={{ uri: photo }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removePhoto(index)}
              >
                <Text style={styles.removeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 5 && (
            <View style={styles.addPhotoButtons}>
              <TouchableOpacity style={styles.addPhotoButton} onPress={takePhoto}>
                <Text style={styles.addPhotoIcon}>📷</Text>
                <Text style={styles.addPhotoText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoButton} onPress={pickImage}>
                <Text style={styles.addPhotoIcon}>🖼️</Text>
                <Text style={styles.addPhotoText}>Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Platform</Text>
        <View style={styles.platformButtons}>
          <StatusChip label="eBay" status="info" />
        </View>

        <TouchableOpacity
          style={styles.hintsToggle}
          onPress={() => setShowHints(!showHints)}
        >
          <Text style={styles.hintsToggleText}>
            {showHints ? '▼ Hide Hints' : '▶ Add Hints (Optional)'}
          </Text>
        </TouchableOpacity>

        {showHints && (
          <Card style={styles.hintsCard}>
            <Text style={styles.hintLabel}>Brand (if known)</Text>
            <TextInput
              style={styles.hintInput}
              value={brand}
              onChangeText={setBrand}
              placeholder="e.g., Nike, Gucci"
              placeholderTextColor={colors.textMuted}
            />
          </Card>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          title="Generate Listing"
          onPress={handleGenerate}
          disabled={photos.length === 0}
          size="lg"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.sizes.large,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.button,
    color: colors.textTertiary,
    marginBottom: spacing.xl,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.xxl,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.bold,
    marginTop: -2,
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  addPhotoButton: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  addPhotoIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  addPhotoText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
  },
  sectionTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  platformButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  hintsToggle: {
    paddingVertical: spacing.md,
  },
  hintsToggleText: {
    fontSize: typography.sizes.body,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  hintsCard: {
    marginHorizontal: 0,
    marginTop: spacing.sm,
  },
  hintLabel: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.medium,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  hintInput: {
    borderWidth: 1,
    borderColor: colors.borderMedium,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: typography.sizes.button,
    color: colors.text,
  },
  footer: {
    padding: spacing.xl,
    paddingBottom: 34,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
