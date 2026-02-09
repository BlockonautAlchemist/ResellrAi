import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import type { ItemAspectsMetadata, AspectDefinition } from '../lib/api';
import { colors, spacing, typography, radii } from '../lib/theme';

interface Props {
  metadata: ItemAspectsMetadata | null;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  missingAspects: string[];
  isLoading: boolean;
}

export default function ItemSpecificsEditor({
  metadata,
  values,
  onChange,
  missingAspects,
  isLoading,
}: Props) {
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (isLoading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Item Specifics</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading category requirements...</Text>
        </View>
      </View>
    );
  }

  if (!metadata || (metadata.requiredAspects.length === 0 && metadata.recommendedAspects.length === 0)) {
    return null; // No aspects to show
  }

  const renderAspectInput = (aspect: AspectDefinition) => {
    const value = values[aspect.name] || '';
    const isMissing = missingAspects.includes(aspect.name);
    const hasValue = value.trim().length > 0;

    if (aspect.mode === 'SELECTION_ONLY' && aspect.allowedValues && aspect.allowedValues.length > 0) {
      // Dropdown for SELECTION_ONLY
      return (
        <TouchableOpacity
          key={aspect.name}
          style={[
            styles.aspectRow,
            isMissing && styles.aspectRowError,
          ]}
          onPress={() => {
            setSearchQuery('');
            setShowPicker(aspect.name);
          }}
        >
          <View style={styles.aspectLabelContainer}>
            <Text style={styles.aspectLabel}>{aspect.name}</Text>
            {aspect.required && <Text style={styles.requiredBadge}>Required</Text>}
          </View>
          <View style={styles.aspectValueContainer}>
            <Text style={[
              styles.aspectValue,
              !hasValue && styles.aspectValuePlaceholder,
              isMissing && styles.aspectValueError,
            ]}>
              {value || 'Select...'}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
          {isMissing && (
            <Text style={styles.errorHint}>This field is required for this category</Text>
          )}
        </TouchableOpacity>
      );
    } else {
      // Free text input
      return (
        <View
          key={aspect.name}
          style={[
            styles.aspectRow,
            isMissing && styles.aspectRowError,
          ]}
        >
          <View style={styles.aspectLabelContainer}>
            <Text style={styles.aspectLabel}>{aspect.name}</Text>
            {aspect.required && <Text style={styles.requiredBadge}>Required</Text>}
          </View>
          <TextInput
            style={[
              styles.textInput,
              isMissing && styles.textInputError,
            ]}
            value={value}
            onChangeText={(text) => onChange(aspect.name, text)}
            placeholder={`Enter ${aspect.name.toLowerCase()}`}
            placeholderTextColor={colors.textMuted}
            maxLength={aspect.maxLength}
          />
          {isMissing && (
            <Text style={styles.errorHint}>This field is required for this category</Text>
          )}
        </View>
      );
    }
  };

  // Find the aspect for the currently open picker
  const pickerAspect = showPicker
    ? [...metadata.requiredAspects, ...metadata.recommendedAspects].find(a => a.name === showPicker)
    : null;

  // Filter allowed values based on search
  const filteredValues = pickerAspect?.allowedValues?.filter(v =>
    v.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Item Specifics</Text>
        {missingAspects.length > 0 && (
          <View style={styles.missingBadge}>
            <Text style={styles.missingBadgeText}>{missingAspects.length} missing</Text>
          </View>
        )}
      </View>

      {/* Required Aspects */}
      {metadata.requiredAspects.length > 0 && (
        <View style={styles.aspectGroup}>
          {metadata.requiredAspects.map(renderAspectInput)}
        </View>
      )}

      {/* Recommended Aspects (show top 5) */}
      {metadata.recommendedAspects.length > 0 && (
        <View style={styles.aspectGroup}>
          <Text style={styles.groupLabel}>Optional</Text>
          {metadata.recommendedAspects.slice(0, 5).map(renderAspectInput)}
        </View>
      )}

      {/* Selection Picker Modal */}
      <Modal
        visible={showPicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {showPicker}</Text>
              <TouchableOpacity onPress={() => setShowPicker(null)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Search input for long lists */}
            {(pickerAspect?.allowedValues?.length || 0) > 10 && (
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search..."
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
              </View>
            )}

            <ScrollView style={styles.optionsList}>
              {filteredValues.length === 0 ? (
                <Text style={styles.noResults}>No matches found</Text>
              ) : (
                filteredValues.map((option) => {
                  const isSelected = values[showPicker!] === option;
                  return (
                    <TouchableOpacity
                      key={option}
                      style={[
                        styles.optionRow,
                        isSelected && styles.optionRowSelected,
                      ]}
                      onPress={() => {
                        onChange(showPicker!, option);
                        setShowPicker(null);
                      }}
                    >
                      <Text style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}>
                        {option}
                      </Text>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  missingBadge: {
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  missingBadgeText: {
    color: colors.textInverse,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
  aspectGroup: {
    marginBottom: spacing.sm,
  },
  groupLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aspectRow: {
    marginBottom: spacing.md,
  },
  aspectRowError: {
    backgroundColor: '#FFF5F5',
    padding: spacing.md,
    marginHorizontal: -spacing.md,
    borderRadius: radii.md,
  },
  aspectLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  aspectLabel: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    fontWeight: typography.weights.medium,
  },
  requiredBadge: {
    fontSize: 10,
    color: colors.warning,
    fontWeight: typography.weights.semibold,
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  aspectValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  aspectValue: {
    fontSize: typography.sizes.input,
    color: colors.text,
    flex: 1,
  },
  aspectValuePlaceholder: {
    color: colors.textMuted,
  },
  aspectValueError: {
    color: colors.error,
  },
  chevron: {
    fontSize: typography.sizes.title,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.inputBackground,
    padding: spacing.md,
    borderRadius: radii.md,
    fontSize: typography.sizes.input,
    color: colors.text,
  },
  textInputError: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  errorHint: {
    fontSize: typography.sizes.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  modalCancel: {
    fontSize: typography.sizes.button,
    color: colors.primary,
  },
  searchContainer: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    backgroundColor: colors.inputBackground,
    padding: 10,
    borderRadius: radii.md,
    fontSize: typography.sizes.input,
  },
  optionsList: {
    paddingBottom: 34,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionRowSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionText: {
    fontSize: typography.sizes.button,
    color: colors.text,
    flex: 1,
  },
  optionTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  checkmark: {
    fontSize: typography.sizes.title,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  noResults: {
    padding: spacing.xl,
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.sizes.body,
  },
});
