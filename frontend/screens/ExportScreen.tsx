import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  exportListing,
  getEbayAccount,
  getEbayPolicies,
  publishToEbay,
  type GenerateListingResponse,
  type EbayConnectedAccount,
  type EbayUserPolicies,
  type EbayPolicy,
  type EbayPublishStep,
  type EbayPublishResult,
  type SellerLocationProfile,
  type PackageWeight,
  type PackageDimensions,
} from '../lib/api';
import PublishProgress from '../components/PublishProgress';
import LocationModal from '../components/LocationModal';
import { TEMP_USER_ID } from '../lib/constants';

interface ExportScreenProps {
  navigation: any;
  route: {
    params: {
      listing: GenerateListingResponse;
      price: number;
      itemSpecifics?: Record<string, string>;
      missingItemSpecifics?: string[];
      packageWeight?: PackageWeight;
      packageDimensions?: PackageDimensions;
    };
  };
}

export default function ExportScreen({ navigation, route }: ExportScreenProps) {
  const { listing, price, itemSpecifics = {}, missingItemSpecifics = [], packageWeight, packageDimensions } = route.params;
  const [copied, setCopied] = useState<'title' | 'description' | 'all' | null>(null);
  const [exported, setExported] = useState(false);

  // eBay state
  const [ebayAccount, setEbayAccount] = useState<EbayConnectedAccount | null>(null);
  const [ebayPolicies, setEbayPolicies] = useState<EbayUserPolicies | null>(null);
  const [isLoadingEbay, setIsLoadingEbay] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicies, setSelectedPolicies] = useState<{
    fulfillment?: EbayPolicy;
    payment?: EbayPolicy;
    return?: EbayPolicy;
  }>({});
  const [publishResult, setPublishResult] = useState<EbayPublishResult | null>(null);
  const [publishSteps, setPublishSteps] = useState<EbayPublishStep[] | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);

  const title = listing.listingDraft.title.value;
  const description = listing.listingDraft.description.value;

  // Check eBay connection on mount
  useEffect(() => {
    checkEbayConnection();
  }, []);

  const checkEbayConnection = async () => {
    try {
      setIsLoadingEbay(true);
      const account = await getEbayAccount(TEMP_USER_ID);
      setEbayAccount(account);

      if (account.connected) {
        const policies = await getEbayPolicies(TEMP_USER_ID);
        setEbayPolicies(policies);

        // Auto-select first policy of each type
        if (policies.fulfillment.length > 0) {
          setSelectedPolicies((prev) => ({ ...prev, fulfillment: policies.fulfillment[0] }));
        }
        if (policies.payment.length > 0) {
          setSelectedPolicies((prev) => ({ ...prev, payment: policies.payment[0] }));
        }
        if (policies.return.length > 0) {
          setSelectedPolicies((prev) => ({ ...prev, return: policies.return[0] }));
        }
      }
    } catch (err) {
      console.error('Failed to check eBay:', err);
    } finally {
      setIsLoadingEbay(false);
    }
  };

  // Map error codes to user-friendly messages and actions
  const getErrorGuidance = (errorCode?: string, errorDetails?: any): { message: string; action?: string; showModal?: boolean; goBack?: boolean } => {
    switch (errorCode) {
      case 'INVALID_CATEGORY':
        return { message: 'Category not valid for eBay', action: 'Select a valid category in the Preview screen', goBack: true };
      case 'MISSING_FULFILLMENT_POLICY':
        return { message: 'No shipping policy selected', action: 'Select a shipping policy below or configure in eBay Seller Hub' };
      case 'MISSING_RETURN_POLICY':
        return { message: 'No return policy selected', action: 'Select a return policy below or configure in eBay Seller Hub' };
      case 'MISSING_PAYMENT_POLICY':
        return { message: 'No payment policy selected', action: 'Select a payment policy below or configure in eBay Seller Hub' };
      case 'INVENTORY_ITEM_FAILED':
        return { message: 'Could not create inventory item', action: 'Check listing details and try again' };
      case 'OFFER_CREATE_FAILED':
        return { message: 'Could not create offer', action: 'Verify all required fields are filled' };
      case 'OFFER_PUBLISH_FAILED':
        return { message: 'Publishing failed', action: 'Try again or contact support' };
      case 'LOCATION_REQUIRED':
        return { message: 'Shipping location required', action: 'Set up a shipping location in eBay Seller Hub' };
      case 'EBAY_LOCATION_REQUIRED':
        return { message: 'Shipping location required', action: 'Enter your shipping location to continue', showModal: true };
      case 'EBAY_NOT_CONNECTED':
      case 'EBAY_REAUTH_REQUIRED':
        return { message: 'eBay connection expired', action: 'Go to Home screen to reconnect your eBay account' };
      case 'MISSING_ITEM_SPECIFICS':
        const missingList = errorDetails?.missing || [];
        const missingNames = missingList.length > 0 ? missingList.join(', ') : 'required fields';
        return {
          message: `Missing required item specifics: ${missingNames}`,
          action: 'Go back to Preview and fill in the required Item Specifics',
          goBack: true,
        };
      case 'INVALID_ITEM_SPECIFIC_VALUE':
        const invalidList = errorDetails?.invalid || [];
        const firstInvalid = invalidList[0];
        const invalidMsg = firstInvalid
          ? `"${firstInvalid.value}" is not valid for ${firstInvalid.aspect}`
          : 'An item specific value is invalid';
        return {
          message: invalidMsg,
          action: 'Go back to Preview and select a valid value from the dropdown',
          goBack: true,
        };
      case 'VALIDATION_MISSING_PACKAGE_WEIGHT':
      case 'MISSING_PACKAGE_WEIGHT':
        return {
          message: 'Package weight is required',
          action: 'Go back to Preview and enter the package weight',
          goBack: true,
        };
      default:
        return { message: 'An error occurred', action: 'Please try again' };
    }
  };

  // Check if error message contains EBAY_LOCATION_REQUIRED (from JSON error)
  const isLocationRequiredError = (errorMessage?: string): boolean => {
    if (!errorMessage) return false;
    try {
      const parsed = JSON.parse(errorMessage);
      return parsed.code === 'EBAY_LOCATION_REQUIRED';
    } catch {
      return errorMessage.includes('EBAY_LOCATION_REQUIRED');
    }
  };

  const handlePublishToEbay = async () => {
    if (!selectedPolicies.fulfillment || !selectedPolicies.payment || !selectedPolicies.return) {
      Alert.alert('Select Policies', 'Please select shipping, payment, and return policies');
      return;
    }

    // Check category
    if (!listing.listingDraft.category.platformCategoryId) {
      Alert.alert('Category Required', 'Please select an eBay category in the Preview screen before publishing.');
      return;
    }

    setIsPublishing(true);
    // Initialize steps for progress display
    setPublishSteps([
      { step: 1, name: 'inventory', status: 'pending' },
      { step: 2, name: 'offer', status: 'pending' },
      { step: 3, name: 'publish', status: 'pending' },
    ]);

    try {
      const result = await publishToEbay(
        TEMP_USER_ID,
        listing.itemId,
        {
          listing_draft: listing.listingDraft,
          photo_urls: listing.photoUrls,
          pricing_suggestion: listing.pricingSuggestion,
          item_specifics: itemSpecifics,  // Pass item specifics from PreviewScreen
          package_weight: packageWeight,  // Pass package weight from PreviewScreen
          package_dimensions: packageDimensions,  // Pass package dimensions from PreviewScreen
        },
        {
          fulfillment_policy_id: selectedPolicies.fulfillment.policy_id,
          payment_policy_id: selectedPolicies.payment.policy_id,
          return_policy_id: selectedPolicies.return.policy_id,
        },
        price
      );

      // Update steps from result
      if (result.steps) {
        setPublishSteps(result.steps);
      }

      setPublishResult(result);

      if (result.success) {
        Alert.alert(
          'Published to eBay!',
          'Your listing is now live on eBay.',
          [
            {
              text: 'View on eBay',
              onPress: () => {
                if (result.listing_url) {
                  Linking.openURL(result.listing_url);
                }
              },
            },
            { text: 'Done', onPress: () => navigation.navigate('Home') },
          ]
        );
      } else {
        // Check for EBAY_LOCATION_REQUIRED error
        const errorCode = result.error?.code;
        const errorMessage = result.error?.message;
        const errorDetails = result.error?.details;

        if (errorCode === 'EBAY_LOCATION_REQUIRED' || isLocationRequiredError(errorMessage)) {
          // Show location modal instead of alert
          setPendingRetry(true);
          setShowLocationModal(true);
        } else {
          const guidance = getErrorGuidance(errorCode, errorDetails);

          if (guidance.goBack) {
            // Show alert with option to go back to Preview
            Alert.alert(
              'Publish Failed',
              `${guidance.message}\n\n${guidance.action || ''}`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Go to Preview',
                  onPress: () => navigation.goBack(),
                },
              ]
            );
          } else {
            Alert.alert('Publish Failed', `${guidance.message}\n\n${guidance.action || ''}`);
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to publish';
      setPublishResult({
        success: false,
        error: { code: 'UNKNOWN', message: errorMsg },
        attempted_at: new Date().toISOString(),
      });
      Alert.alert('Error', errorMsg);
    } finally {
      setIsPublishing(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'title' | 'description' | 'all') => {
    await Clipboard.setStringAsync(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyAll = async () => {
    const fullText = `${title}\n\n${description}\n\nPrice: $${price}`;
    await copyToClipboard(fullText, 'all');
  };

  const handleMarkExported = async () => {
    try {
      await exportListing(listing.itemId, price);
      setExported(true);
      Alert.alert(
        'Listing Exported!',
        'Your listing has been saved. You can now paste it to your marketplace.',
        [
          { text: 'Done', onPress: () => navigation.navigate('Home') },
        ]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to mark as exported');
    }
  };

  const handleLocationSaved = (profile: SellerLocationProfile) => {
    setShowLocationModal(false);
    // Clear previous error
    setPublishResult(null);
    setPublishSteps(null);

    // Auto-retry if we were pending a retry
    if (pendingRetry) {
      setPendingRetry(false);
      // Small delay to allow modal animation to complete
      setTimeout(() => {
        handlePublishToEbay();
      }, 500);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ready to List!</Text>
          <Text style={styles.headerSubtitle}>
            Copy your listing to eBay
          </Text>
        </View>

        {/* Price */}
        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>Listing Price</Text>
          <Text style={styles.priceValue}>${price}</Text>
        </View>

        {/* Title Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Title</Text>
            <TouchableOpacity
              style={[styles.copyButton, copied === 'title' && styles.copyButtonSuccess]}
              onPress={() => copyToClipboard(title, 'title')}
            >
              <Text style={[styles.copyButtonText, copied === 'title' && styles.copyButtonTextSuccess]}>
                {copied === 'title' ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.titleText}>{title}</Text>
        </View>

        {/* Description Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Description</Text>
            <TouchableOpacity
              style={[styles.copyButton, copied === 'description' && styles.copyButtonSuccess]}
              onPress={() => copyToClipboard(description, 'description')}
            >
              <Text style={[styles.copyButtonText, copied === 'description' && styles.copyButtonTextSuccess]}>
                {copied === 'description' ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.descriptionText}>{description}</Text>
        </View>

        {/* Attributes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item Details</Text>
          {listing.listingDraft.attributes.map((attr, index) => (
            <View key={index} style={styles.attributeRow}>
              <Text style={styles.attributeKey}>{attr.key}:</Text>
              <Text style={styles.attributeValue}>{attr.value}</Text>
            </View>
          ))}
        </View>

        {/* eBay Direct Publish */}
        {isLoadingEbay ? (
          <View style={styles.ebayCard}>
            <ActivityIndicator size="small" color="#e53238" />
            <Text style={styles.ebayLoadingText}>Checking eBay connection...</Text>
          </View>
        ) : ebayAccount?.connected ? (
          <View style={styles.ebayCard}>
            <View style={styles.ebayHeader}>
              <Text style={styles.ebayTitle}>Publish Directly to eBay</Text>
              <View style={styles.ebayConnectedBadge}>
                <Text style={styles.ebayConnectedText}>Connected</Text>
              </View>
            </View>

            {/* Show progress when publishing */}
            {isPublishing && publishSteps && (
              <PublishProgress steps={publishSteps} />
            )}

            {/* Success State */}
            {publishResult?.success ? (
              <View style={styles.ebaySuccess}>
                <Text style={styles.ebaySuccessText}>Published to eBay!</Text>
                {publishResult.listing_url && (
                  <TouchableOpacity
                    style={styles.viewListingButton}
                    onPress={() => Linking.openURL(publishResult.listing_url!)}
                  >
                    <Text style={styles.viewListingButtonText}>View on eBay</Text>
                  </TouchableOpacity>
                )}
                {publishResult.sku && (
                  <Text style={styles.publishDetailText}>SKU: {publishResult.sku}</Text>
                )}
                {publishResult.listing_id && (
                  <Text style={styles.publishDetailText}>Listing ID: {publishResult.listing_id}</Text>
                )}
              </View>
            ) : !isPublishing ? (
              <>
                {/* Show progress if there was an error (to show which step failed) */}
                {publishResult?.steps && !publishResult.success && (
                  <View style={styles.errorProgressContainer}>
                    <PublishProgress steps={publishResult.steps} />
                  </View>
                )}

                {/* Error Message with Guidance */}
                {publishResult?.error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorTitle}>{publishResult.error.message}</Text>
                    {publishResult.error.action && (
                      <Text style={styles.errorAction}>
                        {getErrorGuidance(publishResult.error.code).action}
                      </Text>
                    )}
                  </View>
                )}

                {/* Category Warning */}
                {!listing.listingDraft.category.platformCategoryId && (
                  <View style={styles.warningContainer}>
                    <Text style={styles.warningText}>
                      No eBay category selected. Go back to Preview to select a category.
                    </Text>
                  </View>
                )}

                {/* Policy Selection */}
                <View style={styles.policySection}>
                  <Text style={styles.policySectionTitle}>Shipping & Policies</Text>
                  <TouchableOpacity
                    style={styles.policySelector}
                    onPress={() => setShowPolicyModal(true)}
                  >
                    <Text style={styles.policySelectorText}>
                      {selectedPolicies.fulfillment?.name || 'Select policies...'}
                    </Text>
                    <Text style={styles.policySelectorArrow}>›</Text>
                  </TouchableOpacity>
                </View>

                {/* Publish Button */}
                <TouchableOpacity
                  style={[
                    styles.publishButton,
                    (!selectedPolicies.fulfillment || !listing.listingDraft.category.platformCategoryId) &&
                      styles.publishButtonDisabled,
                  ]}
                  onPress={handlePublishToEbay}
                  disabled={!selectedPolicies.fulfillment || !listing.listingDraft.category.platformCategoryId}
                >
                  <Text style={styles.publishButtonText}>Publish to eBay - ${price}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ) : (
          <View style={styles.ebayCard}>
            <Text style={styles.ebayNotConnectedTitle}>Connect eBay to publish directly</Text>
            <Text style={styles.ebayNotConnectedText}>
              Go to Home screen to connect your eBay account
            </Text>
          </View>
        )}

        {/* Manual Instructions */}
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Or List Manually</Text>
          <Text style={styles.instructionsText}>
            1. Open eBay app{'\n'}
            2. Start a new listing{'\n'}
            3. Paste the title and description{'\n'}
            4. Upload your photos{'\n'}
            5. Set price to ${price}{'\n'}
            6. Publish your listing!
          </Text>
        </View>
      </ScrollView>

      {/* Location Modal */}
      <LocationModal
        visible={showLocationModal}
        onClose={() => {
          setShowLocationModal(false);
          setPendingRetry(false);
        }}
        onSaved={handleLocationSaved}
      />

      {/* Policy Selection Modal */}
      <Modal
        visible={showPolicyModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPolicyModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Policies</Text>
            <TouchableOpacity onPress={() => setShowPolicyModal(false)}>
              <Text style={styles.modalDone}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Fulfillment Policies */}
            <Text style={styles.policyGroupTitle}>Shipping Policy</Text>
            {ebayPolicies?.fulfillment.map((policy) => (
              <TouchableOpacity
                key={policy.policy_id}
                style={[
                  styles.policyOption,
                  selectedPolicies.fulfillment?.policy_id === policy.policy_id &&
                    styles.policyOptionSelected,
                ]}
                onPress={() =>
                  setSelectedPolicies((prev) => ({ ...prev, fulfillment: policy }))
                }
              >
                <Text style={styles.policyOptionText}>{policy.name}</Text>
                {selectedPolicies.fulfillment?.policy_id === policy.policy_id && (
                  <Text style={styles.policyCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Payment Policies */}
            <Text style={styles.policyGroupTitle}>Payment Policy</Text>
            {ebayPolicies?.payment.map((policy) => (
              <TouchableOpacity
                key={policy.policy_id}
                style={[
                  styles.policyOption,
                  selectedPolicies.payment?.policy_id === policy.policy_id &&
                    styles.policyOptionSelected,
                ]}
                onPress={() =>
                  setSelectedPolicies((prev) => ({ ...prev, payment: policy }))
                }
              >
                <Text style={styles.policyOptionText}>{policy.name}</Text>
                {selectedPolicies.payment?.policy_id === policy.policy_id && (
                  <Text style={styles.policyCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {/* Return Policies */}
            <Text style={styles.policyGroupTitle}>Return Policy</Text>
            {ebayPolicies?.return.map((policy) => (
              <TouchableOpacity
                key={policy.policy_id}
                style={[
                  styles.policyOption,
                  selectedPolicies.return?.policy_id === policy.policy_id &&
                    styles.policyOptionSelected,
                ]}
                onPress={() =>
                  setSelectedPolicies((prev) => ({ ...prev, return: policy }))
                }
              >
                <Text style={styles.policyOptionText}>{policy.name}</Text>
                {selectedPolicies.return?.policy_id === policy.policy_id && (
                  <Text style={styles.policyCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}

            {ebayPolicies && !ebayPolicies.has_required_policies && (
              <View style={styles.policyWarning}>
                <Text style={styles.policyWarningText}>
                  Missing policies: {ebayPolicies.missing_policies.join(', ')}.
                  Please set up policies in eBay Seller Hub.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.copyAllButton, copied === 'all' && styles.copyAllButtonSuccess]}
          onPress={copyAll}
        >
          <Text style={styles.copyAllButtonText}>
            {copied === 'all' ? 'Copied to Clipboard!' : 'Copy All to Clipboard'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.doneButton, exported && styles.doneButtonSuccess]}
          onPress={exported ? () => navigation.navigate('Home') : handleMarkExported}
        >
          <Text style={styles.doneButtonText}>
            {exported ? 'Back to Home' : 'Mark as Exported'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#34C759',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  priceCard: {
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  priceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  priceValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
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
  copyButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  copyButtonSuccess: {
    backgroundColor: '#34C759',
  },
  copyButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  copyButtonTextSuccess: {
    color: '#fff',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    lineHeight: 24,
  },
  descriptionText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  attributeRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  attributeKey: {
    fontSize: 14,
    color: '#666',
    width: 100,
  },
  attributeValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  instructionsCard: {
    backgroundColor: '#E3F2FF',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 24,
  },
  footer: {
    padding: 16,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 12,
  },
  copyAllButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  copyAllButtonSuccess: {
    backgroundColor: '#34C759',
  },
  copyAllButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonSuccess: {
    backgroundColor: '#34C759',
  },
  doneButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  // eBay Styles
  ebayCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e53238',
  },
  ebayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ebayTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  ebayConnectedBadge: {
    backgroundColor: '#34C759',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ebayConnectedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  ebayLoadingText: {
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  ebayNotConnectedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ebayNotConnectedText: {
    fontSize: 14,
    color: '#666',
  },
  policySection: {
    marginBottom: 12,
  },
  policySectionTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  policySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  policySelectorText: {
    fontSize: 15,
    color: '#333',
  },
  policySelectorArrow: {
    fontSize: 20,
    color: '#999',
  },
  publishButton: {
    backgroundColor: '#e53238',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  publishButtonDisabled: {
    backgroundColor: '#ccc',
  },
  publishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  ebaySuccess: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  ebaySuccessText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#34C759',
    marginBottom: 12,
  },
  viewListingButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  viewListingButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  publishDetailText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  errorProgressContainer: {
    marginBottom: 12,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
  },
  errorAction: {
    fontSize: 13,
    color: '#666',
  },
  warningContainer: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalDone: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  policyGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  policyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  policyOptionSelected: {
    backgroundColor: '#E8F4FD',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  policyOptionText: {
    fontSize: 15,
    color: '#333',
  },
  policyCheckmark: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  policyWarning: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  policyWarningText: {
    fontSize: 14,
    color: '#856404',
  },
});
