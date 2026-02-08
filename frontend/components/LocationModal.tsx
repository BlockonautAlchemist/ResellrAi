import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import {
  getSellerLocation,
  saveSellerLocation,
  type SellerLocationProfile,
  type SaveSellerLocationRequest,
} from '../lib/api';

interface LocationModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (profile: SellerLocationProfile) => void;
}

export default function LocationModal({ visible, onClose, onSaved }: LocationModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [stateOrProvince, setStateOrProvince] = useState('');
  const [addressLine1, setAddressLine1] = useState('');

  // Load existing location on open
  useEffect(() => {
    if (visible) {
      loadExistingLocation();
    }
  }, [visible]);

  const loadExistingLocation = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await getSellerLocation();

      if (profile) {
        setPostalCode(profile.postal_code || '');
        setCity(profile.city || '');
        setStateOrProvince(profile.state_or_province || '');
        setAddressLine1(profile.address_line1 || '');
      }
    } catch (err) {
      console.error('Failed to load location:', err);
      // Don't show error for load - just start with empty form
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = () => {
    // For US, all three are required
    const hasPostalCode = postalCode.trim().length > 0;
    const hasCity = city.trim().length > 0;
    const hasState = stateOrProvince.trim().length > 0;
    return hasPostalCode && hasCity && hasState;
  };

  const handleSave = async () => {
    if (!isValid()) {
      setError('City, state, AND postal code are all required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const locationData: SaveSellerLocationRequest = {
        country: 'US',
        postal_code: postalCode.trim(),
        city: city.trim(),
        state_or_province: stateOrProvince.trim(),
      };
      if (addressLine1.trim()) {
        locationData.address_line1 = addressLine1.trim();
      }

      const profile = await saveSellerLocation(locationData);
      onSaved(profile);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save location';
      setError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={isSaving}>
            <Text style={[styles.headerButton, isSaving && styles.headerButtonDisabled]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shipping Location</Text>
          <TouchableOpacity onPress={handleSave} disabled={isSaving || !isValid()}>
            <Text
              style={[
                styles.headerButton,
                styles.headerButtonPrimary,
                (isSaving || !isValid()) && styles.headerButtonDisabled,
              ]}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.description}>
              Enter your shipping location for eBay listings. City, state, and ZIP are required.
            </Text>

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Required Fields */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Required</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>ZIP/Postal Code *</Text>
                <TextInput
                  style={styles.input}
                  value={postalCode}
                  onChangeText={setPostalCode}
                  placeholder="e.g., 97201"
                  placeholderTextColor="#999"
                  keyboardType="default"
                  autoCapitalize="characters"
                  maxLength={20}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>City *</Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g., Portland"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                  maxLength={128}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>State *</Text>
                <TextInput
                  style={styles.input}
                  value={stateOrProvince}
                  onChangeText={setStateOrProvince}
                  placeholder="e.g., OR"
                  placeholderTextColor="#999"
                  autoCapitalize="characters"
                  maxLength={128}
                />
              </View>
            </View>

            {/* Optional */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Optional</Text>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Street Address</Text>
                <TextInput
                  style={styles.input}
                  value={addressLine1}
                  onChangeText={setAddressLine1}
                  placeholder="e.g., 123 Main St"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                  maxLength={128}
                />
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                This location will be used as your default shipping origin for all eBay listings.
              </Text>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  headerButton: {
    fontSize: 16,
    color: '#007AFF',
  },
  headerButtonPrimary: {
    fontWeight: '600',
  },
  headerButtonDisabled: {
    color: '#ccc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  footer: {
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 18,
  },
});
