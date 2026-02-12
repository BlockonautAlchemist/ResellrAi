import React, { useState, useEffect, useRef } from 'react';
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
  AppState,
  AppStateStatus,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import {
  exportListing,
  getEbayAccount,
  getEbayPolicies,
  publishToEbay,
  getUsageStatus,
  startEbayOAuth,
  type GenerateListingResponse,
  type EbayConnectedAccount,
  type EbayUserPolicies,
  type EbayPolicy,
  type EbayPublishStep,
  type EbayPublishResult,
  type UsageStatus,
  type SellerLocationProfile,
  type PackageWeight,
  type PackageDimensions,
} from '../lib/api';
import PublishProgress from '../components/PublishProgress';
import LocationModal from '../components/LocationModal';
import { colors, spacing, typography, radii } from '../lib/theme';
import { ScreenContainer, PrimaryButton, Card, StatusChip, ErrorBanner } from '../components/ui';
import { setOAuthReturnRoute } from '../lib/oauth';

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
      ebayCallback?: boolean;
      ebaySuccess?: boolean;
      ebayError?: string;
      ebayMessage?: string;
    };
  };
}

export default function ExportScreen({ navigation, route }: ExportScreenProps) {
  const { listing, price, itemSpecifics = {}, missingItemSpecifics = [], packageWeight, packageDimensions } = route.params;
  const [copied, setCopied] = useState<'title' | 'description' | 'details' | 'all' | null>(null);
  const [exported, setExported] = useState(false);

  // eBay state
  const [ebayAccount, setEbayAccount] = useState<EbayConnectedAccount | null>(null);
  const [ebayPolicies, setEbayPolicies] = useState<EbayUserPolicies | null>(null);
  const [isLoadingEbay, setIsLoadingEbay] = useState(true);
  const [isConnectingEbay, setIsConnectingEbay] = useState(false);
  const [isRefreshingEbay, setIsRefreshingEbay] = useState(false);
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
  const [usageStatus, setUsageStatus] = useState<UsageStatus | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const pendingOAuthRef = useRef(false);
  const appState = useRef(AppState.currentState);

  const title = listing.listingDraft.title.value;
  const description = listing.listingDraft.description.value;

  // Check eBay connection on mount
  useEffect(() => {
    checkEbayConnection();
  }, []);

  useEffect(() => {
    fetchUsageStatus();
  }, []);

  useEffect(() => {
    const params = route.params;
    if (params?.ebayCallback) {
      pendingOAuthRef.current = false;
      setIsConnectingEbay(false);
      setIsRefreshingEbay(true);
      Promise.all([checkEbayConnection(), fetchUsageStatus()])
        .finally(() => setIsRefreshingEbay(false));

      navigation.setParams({
        ebayCallback: undefined,
        ebaySuccess: undefined,
        ebayError: undefined,
        ebayMessage: undefined,
      });
    }
  }, [route.params, navigation]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (pendingOAuthRef.current) {
          pendingOAuthRef.current = false;
          setIsConnectingEbay(false);
          setIsRefreshingEbay(true);
          Promise.all([checkEbayConnection(), fetchUsageStatus()])
            .finally(() => setIsRefreshingEbay(false));
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  const fetchUsageStatus = async () => {
    try {
      setUsageLoading(true);
      const status = await getUsageStatus();
      setUsageStatus(status);
    } catch (err) {
      console.warn('[ExportScreen] Failed to fetch usage status:', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const isPremiumUser = usageStatus?.isPremium === true;
  const hasTrialAvailable = usageStatus?.publishTrial?.available === true;
  const canPublish = isPremiumUser || hasTrialAvailable;

  const checkEbayConnection = async () => {
    try {
      setIsLoadingEbay(true);
      const account = await getEbayAccount();
      setEbayAccount(account);

      if (account.connected) {
        const policies = await getEbayPolicies();
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
      case 'PUBLISH_NOT_ALLOWED':
        return {
          message: 'Your one-time direct publish trial has been used',
          action: 'Upgrade to Premium for unlimited direct eBay publishing and price comparables',
        };
      case 'EBAY_NOT_CONNECTED':
      case 'EBAY_REAUTH_REQUIRED':
        return { message: 'eBay connection expired', action: 'Reconnect your eBay account below to continue' };
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
    if (!canPublish) {
      Alert.alert(
        'Upgrade Required',
        'Your one-time direct publish trial has already been used. Upgrade to Premium for unlimited direct publishing and price comparables.'
      );
      return;
    }

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
        listing.itemId,
        {
          listing_draft: listing.listingDraft,
          photo_urls: listing.photoUrls,
          pricing_suggestion: listing.pricingSuggestion,
          item_specifics: itemSpecifics,
          package_weight: packageWeight,
          package_dimensions: packageDimensions,
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
      await fetchUsageStatus();

      if (result.success) {
        const isTrialPublish = result.entitlement?.usedTrial === true;
        Alert.alert('Published to eBay!', isTrialPublish
          ? 'Your one-time direct publish trial is complete. Upgrade to Premium for unlimited direct publishing.'
          : 'Your listing is now live on eBay.', [
          {
            text: 'View on eBay',
            onPress: () => {
              if (result.listing_url) {
                Linking.openURL(result.listing_url);
              }
            },
          },
          isTrialPublish
            ? { text: 'Stay Here', style: 'cancel' }
            : { text: 'Done', onPress: () => navigation.navigate('Home') },
        ]);
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

  const copyToClipboard = async (text: string, type: 'title' | 'description' | 'details' | 'all') => {
    await Clipboard.setStringAsync(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleConnectEbay = async () => {
    try {
      setIsConnectingEbay(true);
      setOAuthReturnRoute('Export');
      const { auth_url } = await startEbayOAuth();
      pendingOAuthRef.current = true;
      await WebBrowser.openBrowserAsync(auth_url);
    } catch (err) {
      pendingOAuthRef.current = false;
      setIsConnectingEbay(false);
      setOAuthReturnRoute(null);
      Alert.alert('Connection Error', err instanceof Error ? err.message : 'Failed to start eBay connection');
    }
  };

  const buildItemDetailsText = () => {
    const categoryValue = listing.listingDraft.category.value;
    const conditionValue = listing.listingDraft.condition?.value;
    const categoryText = categoryValue ? `Category: ${categoryValue}` : '';
    const conditionText = conditionValue ? `Condition: ${conditionValue}` : '';
    const mergedDetails = new Map<string, string>();

    for (const attr of listing.listingDraft.attributes) {
      const key = attr.key?.trim();
      const value = attr.value?.trim();
      if (key && value) {
        mergedDetails.set(key.toLowerCase(), `${attr.key}: ${attr.value}`);
      }
    }

    for (const [key, value] of Object.entries(itemSpecifics)) {
      const cleanKey = key?.trim();
      const cleanValue = value?.trim();
      if (cleanKey && cleanValue) {
        mergedDetails.set(cleanKey.toLowerCase(), `${cleanKey}: ${cleanValue}`);
      }
    }

    return [
      categoryText,
      conditionText,
      ...Array.from(mergedDetails.values()),
    ]
      .filter(Boolean)
      .join('\n');
  };

  const copyAll = async () => {
    const itemDetailsText = buildItemDetailsText();

    const fullText = [
      title,
      description,
      itemDetailsText ? `Item Details:\n${itemDetailsText}` : null,
      `Price: $${price}`,
    ]
      .filter(Boolean)
      .join('\n\n');
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
    <ScreenContainer edges={[]} noPadding>
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
        <Card>
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
        </Card>

        {/* Description Section */}
        <Card>
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
        </Card>

        {/* Attributes */}
        <Card>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Item Details</Text>
            <TouchableOpacity
              style={[styles.copyButton, copied === 'details' && styles.copyButtonSuccess]}
              onPress={() => copyToClipboard(buildItemDetailsText(), 'details')}
            >
              <Text style={[styles.copyButtonText, copied === 'details' && styles.copyButtonTextSuccess]}>
                {copied === 'details' ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
          </View>
          {listing.listingDraft.attributes.map((attr, index) => (
            <View key={index} style={styles.attributeRow}>
              <Text style={styles.attributeKey}>{attr.key}:</Text>
              <Text style={styles.attributeValue}>{attr.value}</Text>
            </View>
          ))}
        </Card>

        {/* eBay Direct Publish */}
        {isLoadingEbay ? (
          <Card borderColor={colors.ebay}>
            <ActivityIndicator size="small" color={colors.ebay} />
            <Text style={styles.ebayLoadingText}>Checking eBay connection...</Text>
          </Card>
        ) : ebayAccount?.connected ? (
          <Card borderColor={colors.ebay}>
            <View style={styles.ebayHeader}>
              <Text style={styles.ebayTitle}>Publish Directly to eBay</Text>
              <StatusChip label="Connected" status="success" />
            </View>
            {!usageLoading && !isPremiumUser && hasTrialAvailable && (
              <ErrorBanner
                message="Trial unlocked: You have 1 one-time direct publish available from connecting eBay."
                type="warning"
              />
            )}
            {!usageLoading && !isPremiumUser && usageStatus?.publishTrial?.used && (
              <ErrorBanner
                message="Your one-time direct publish trial has been used. Upgrade to Premium for unlimited direct publishing."
                type="warning"
              />
            )}

            {/* Show progress when publishing */}
            {isPublishing && publishSteps && (
              <PublishProgress steps={publishSteps} />
            )}

            {/* Success State */}
            {publishResult?.success ? (
              <>
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

                {!isPremiumUser && (
                  <Card style={styles.trialCtaCard}>
                    <Text style={styles.trialCtaTitle}>Keep Publishing Without Limits</Text>
                    <Text style={styles.trialCtaBody}>
                      You used your one-time direct publish trial. Upgrade to Premium for unlimited direct eBay publishing.
                    </Text>
                    <PrimaryButton
                      title="Upgrade to Premium"
                      onPress={() => navigation.navigate('Premium')}
                    />
                  </Card>
                )}
              </>
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
                  <ErrorBanner
                    message={publishResult.error.message}
                    action={getErrorGuidance(publishResult.error.code).action}
                    type="error"
                  />
                )}

                {/* Category Warning */}
                {!listing.listingDraft.category.platformCategoryId && (
                  <ErrorBanner
                    message="No eBay category selected. Go back to Preview to select a category."
                    type="warning"
                  />
                )}

                {/* Premium Required Warning */}
                {!usageLoading && !canPublish && (
                  <ErrorBanner
                    message="Your one-time direct publish trial has been used. Upgrade to Premium for unlimited direct publishing and price comparables."
                    type="warning"
                  />
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

                {/* Missing Item Specifics Warning */}
                {missingItemSpecifics.length > 0 && (
                  <ErrorBanner
                    message={`${missingItemSpecifics.length} required item specific${missingItemSpecifics.length > 1 ? 's' : ''} still missing. Go back to Preview to fill them in.`}
                    type="warning"
                  />
                )}

                {/* Publish Button */}
                <PrimaryButton
                  title={`Publish to eBay - $${price}`}
                  onPress={handlePublishToEbay}
                  disabled={!canPublish || !selectedPolicies.fulfillment || !listing.listingDraft.category.platformCategoryId || missingItemSpecifics.length > 0}
                  variant="ebay"
                />
              </>
            ) : null}
          </Card>
        ) : (
          <Card borderColor={colors.ebay}>
            <Text style={styles.ebayNotConnectedTitle}>Connect eBay to publish directly</Text>
            <Text style={styles.ebayNotConnectedText}>
              Connect eBay here to unlock a one-time direct publish trial and experience the full Premium publish flow.
            </Text>
            <PrimaryButton
              title={isConnectingEbay || isRefreshingEbay ? 'Connecting eBay...' : 'Connect eBay'}
              onPress={handleConnectEbay}
              loading={isConnectingEbay || isRefreshingEbay}
              disabled={isConnectingEbay || isRefreshingEbay}
              variant="ebay"
            />
          </Card>
        )}

        {/* Manual Instructions */}
        <Card style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>Or List Manually</Text>
          <Text style={styles.instructionsText}>
            1. Open eBay app{'\n'}
            2. Start a new listing{'\n'}
            3. Paste the title, description, and item details{'\n'}
            4. Upload your photos{'\n'}
            5. Set price to ${price}{'\n'}
            6. Publish your listing!
          </Text>
        </Card>
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
              <ErrorBanner
                message={`Missing policies: ${ebayPolicies.missing_policies.join(', ')}. Please set up policies in eBay Seller Hub.`}
                type="warning"
              />
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Footer */}
      <View style={styles.footer}>
        <PrimaryButton
          title={copied === 'all' ? 'Copied to Clipboard!' : 'Copy All to Clipboard'}
          onPress={copyAll}
          variant={copied === 'all' ? 'success' : 'primary'}
        />
        <View style={styles.footerSpacer} />
        <PrimaryButton
          title={exported ? 'Back to Home' : 'Mark as Exported'}
          onPress={exported ? () => navigation.navigate('Home') : handleMarkExported}
          variant={exported ? 'success' : 'secondary'}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  headerTitle: {
    fontSize: typography.sizes.large,
    fontWeight: typography.weights.bold,
    color: colors.success,
  },
  headerSubtitle: {
    fontSize: typography.sizes.button,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  priceCard: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  priceLabel: {
    color: colors.whiteAlpha80,
    fontSize: typography.sizes.body,
    marginBottom: spacing.xs,
  },
  priceValue: {
    color: colors.textInverse,
    fontSize: typography.sizes.hero,
    fontWeight: typography.weights.bold,
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
  copyButton: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm - 2,
    borderRadius: radii.xl,
  },
  copyButtonSuccess: {
    backgroundColor: colors.success,
  },
  copyButtonText: {
    color: colors.primary,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  copyButtonTextSuccess: {
    color: colors.textInverse,
  },
  titleText: {
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    lineHeight: 24,
  },
  descriptionText: {
    fontSize: typography.sizes.input,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  attributeRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm - 2,
  },
  attributeKey: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    width: 100,
  },
  attributeValue: {
    fontSize: typography.sizes.body,
    color: colors.text,
    fontWeight: typography.weights.medium,
    flex: 1,
  },
  instructionsCard: {
    backgroundColor: colors.primaryLight,
  },
  instructionsTitle: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  instructionsText: {
    fontSize: typography.sizes.body,
    color: colors.text,
    lineHeight: 24,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: 34,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerSpacer: {
    height: spacing.md,
  },
  // eBay Styles
  ebayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ebayTitle: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  ebayLoadingText: {
    color: colors.textTertiary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  ebayNotConnectedTitle: {
    fontSize: typography.sizes.button,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  ebayNotConnectedText: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  trialCtaCard: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryLight,
  },
  trialCtaTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  trialCtaBody: {
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  policySection: {
    marginBottom: spacing.md,
  },
  policySectionTitle: {
    fontSize: typography.sizes.body,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  policySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  policySelectorText: {
    fontSize: typography.sizes.input,
    color: colors.text,
  },
  policySelectorArrow: {
    fontSize: 20,
    color: colors.textMuted,
  },
  ebaySuccess: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  ebaySuccessText: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.success,
    marginBottom: spacing.md,
  },
  viewListingButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  viewListingButtonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
  },
  publishDetailText: {
    fontSize: typography.sizes.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  errorProgressContainer: {
    marginBottom: spacing.md,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.title,
    fontWeight: typography.weights.semibold,
    color: colors.text,
  },
  modalDone: {
    fontSize: typography.sizes.button,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  policyGroupTitle: {
    fontSize: typography.sizes.body,
    fontWeight: typography.weights.semibold,
    color: colors.textTertiary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  policyOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  policyOptionSelected: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  policyOptionText: {
    fontSize: typography.sizes.input,
    color: colors.text,
  },
  policyCheckmark: {
    fontSize: typography.sizes.button,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
});
