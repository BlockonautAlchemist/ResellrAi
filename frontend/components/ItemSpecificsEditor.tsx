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
          <ActivityIndicator size="small" color="#007AFF" />
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
            placeholderTextColor="#999"
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
                  placeholderTextColor="#999"
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
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  missingBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  missingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  aspectGroup: {
    marginBottom: 8,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aspectRow: {
    marginBottom: 12,
  },
  aspectRowError: {
    backgroundColor: '#FFF5F5',
    padding: 12,
    marginHorizontal: -12,
    borderRadius: 8,
  },
  aspectLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  aspectLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  requiredBadge: {
    fontSize: 10,
    color: '#FF9500',
    fontWeight: '600',
    marginLeft: 6,
    textTransform: 'uppercase',
  },
  aspectValueContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  aspectValue: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  aspectValuePlaceholder: {
    color: '#999',
  },
  aspectValueError: {
    color: '#FF3B30',
  },
  chevron: {
    fontSize: 18,
    color: '#999',
    marginLeft: 8,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    fontSize: 15,
    color: '#333',
  },
  textInputError: {
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  errorHint: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCancel: {
    fontSize: 16,
    color: '#007AFF',
  },
  searchContainer: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    fontSize: 15,
  },
  optionsList: {
    paddingBottom: 34,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  optionRowSelected: {
    backgroundColor: '#E3F2FF',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  checkmark: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
  noResults: {
    padding: 20,
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
});
