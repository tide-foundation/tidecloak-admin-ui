import {
  useWatch,
  useForm
} from "react-hook-form";
import {
  AlertVariant,
  FormGroup,
  ClipboardCopy,
  Label,
  Button,
  Text,
  Spinner
} from "@patternfly/react-core";
import { HelpItem, ScrollForm } from "@keycloak/keycloak-ui-shared";
import { useState, FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { FormAccess } from "../form/FormAccess.js";
import { KEY_PROVIDER_TYPE } from "../../util.js";
import { useRealm } from "../../context/realm-context/RealmContext.js";
import ComponentRepresentation from "@keycloak/keycloak-admin-client/lib/defs/componentRepresentation";
import { useAdminClient } from "../../admin-client.js";
import { IdentityProviderParams } from "../../identity-providers/routes/IdentityProvider.js";
import { useParams } from "../../utils/useParams.js";
import { GenSessKey, GetPublic, RandomBigInt } from "../../../tide-modules/modules/Cryptide/Math.js";
import { Bytes2Hex, Hex2Bytes, StringToUint8Array } from "../../../tide-modules/modules/Cryptide/Serialization.js";
import AuthRequest from "../../../tide-modules/modules/TideJS/Models/AuthRequest.js";
import { Point } from "../../../tide-modules/modules/Cryptide/index";
import { CurrentTime } from "../../../tide-modules/modules/TideJS/Tools/Utils.js";
import dKeyGenerationFlow from "../../../tide-modules/modules/TideJS/Flow/dKeyGenerationFlow.js";
import NetworkClient from "../../../tide-modules/modules/TideJS/Clients/NetworkClient.js";
import BaseSignRequest from "../../../tide-modules/modules/TideJS/Models/BaseSignRequest.js";
import dVVKSigningFlow from "../../../tide-modules/modules/TideJS/Flow/SigningFlows/dVVKSigningFlow.js";
import HashToPoint from "../../../tide-modules/modules/Cryptide/Hashing/H2P.js";
import { useAlerts, useFetch } from "@keycloak/keycloak-ui-shared";
import { TideLicenseHistory } from "./TideLicenseHistory";
import NodeClient from "../../../tide-modules/modules/TideJS/Clients/NodeClient.js";
import { KeyProviderParams } from "../../realm-settings/routes/KeyProvider.js";
import { resignSettings } from "../../identity-providers/utils/SignSettingsUtil.js";
// TIDECLOAK IMPLEMENTATION
type TideLicensingTabProps = {
  refreshCallback?: () => Promise<void> | undefined;
};

enum LicensingTiers {
  Free = 'FreeTier',
};

export const TideLicensingTab: FC<TideLicensingTabProps> = ({ refreshCallback }) => {
  const { t } = useTranslation();
  const { adminClient } = useAdminClient();
  const { alias, providerId } = useParams<IdentityProviderParams>();
  const params = useParams<KeyProviderParams>();


  const [tideClient, setTideClient] = useState<NodeClient>();
  const [activeLicenseDetails, setActiveLicenseDetails] = useState<string>("");
  const [tempLicenseDetails, setTempLicenseDetails] = useState<string>("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPendingResign, setIsPendingResign] = useState<boolean>(false);
  const [isInitialCheckout, setIsInitialCheckout] = useState<boolean>(false);


  const [key, setKey] = useState(0);
  const { realm, realmRepresentation } = useRealm();
  const { addAlert } = useAlerts();
  const form = useForm<ComponentRepresentation>({
    mode: "onChange",
  });
  const { getValues, reset, control, setValue } = form;
  const [currentUsers, setCurrentUsers] = useState<string>("0");
  const [licenseExpiry, setLicenseExpiry] = useState<string>("0");
  const [licenseMaxUserAcc, setLicenseMaxUserAcc] = useState<string>("0");
  const [payerUrl, setPayerUrl] = useState<string>("");
  const { id } = useParams<{ id: string }>();


  const fieldNames = [
    "config.gVRK",
    "config.payerPublic",
    "config.vendorId",
    "config.tempgVRK",
    "config.tempVendorId",
    "config.vvkId",
    "config.customerId",
    "config.maxUserAcc",
    "config.initialSessionId",
    "config.systemHomeOrk"
  ] as const;

  // Function to ensure each watched field is a single string
  function getSingleValue(value: string | string[]): string {
    return Array.isArray(value) ? value[0] : value;
  }

  // Use `useWatch` for each field and apply type narrowing
  const watchedConfig = fieldNames.reduce((acc, fieldName) => {
    acc[fieldName] = getSingleValue(useWatch({ control, name: fieldName }));
    return acc;
  }, {} as Record<typeof fieldNames[number], string>);
  // Now you can access each config like so:
  const {
    ["config.gVRK"]: watchConfigGVRK,
    ["config.payerPublic"]: watchConfigPayerPub,
    ["config.vendorId"]: watchConfigVendorId,
    ["config.tempgVRK"]: watchConfigTempGVRK,
    ["config.tempVendorId"]: watchConfigTempVendorId,
    ["config.vvkId"]: watchConfigVVKId,
    ["config.customerId"]: watchConfigCustomerId,
    ["config.maxUserAcc"]: watchConfigMaxUserAcc,
    ["config.initialSessionId"]: watchConfigInitialSessionId,
    ["config.systemHomeOrk"]: watchConfigHomeOrkUrl
  } = watchedConfig;

  const formRef = useRef<HTMLFormElement>(null);
  const vendorIdRef = useRef<HTMLInputElement>(null);
  const timestampRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const redirectRef = useRef<HTMLInputElement>(null);

  useFetch(
    async () => {
      if (id) return await adminClient.components.findOne({ id });
    },
    (result) => {
      if (result) {
        reset({ ...result });
      }
    },
    [],
  );

  useEffect(() => {
    const initializeTideClient = async () => {
      const payerUrl = await getPayerUrl();
      setTideClient(new NodeClient(payerUrl));
      setPayerUrl(payerUrl);
    };
    if (hasValue(watchConfigHomeOrkUrl)) {
      initializeTideClient();
    }
  }, [watchConfigHomeOrkUrl]);

  // Helper functions
  const hasValue = (value: string) => value !== undefined && value !== null && value !== "" ? true : false;
  const objectHasValues = (obj: { [key: string]: any }) => {
    return Object.values(obj).some(value => value !== undefined && value !== null && value !== '');
  };

  // Retry function without dependencies
  const retry = async (fn: () => Promise<boolean | undefined>, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (result) {
          return result; // Success, return the result
        }
      } catch (error) {
        console.error(`Attempt ${i + 1} failed. Retrying...`, error);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw new Error(`Failed after ${retries} retries`);
  };

  const isLicensePending = () => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');

    if (queryIndex !== -1) {
      const queryString = hash.substring(queryIndex + 1); // Remove the part before '?'
      const queryParams = new URLSearchParams(queryString);

      const retryLicenseActivation = queryParams.get("licensePending") === "true";
      // Remove the query parameters from the hash, no longer need it
      window.location.hash = hash.substring(0, queryIndex); // Keep only the part before the '?'
      return retryLicenseActivation;
    }
    // Return false if no query parameters are found
    return false;
  };


  useEffect(() => {
    const activateLicense = async () => {
      try {
        let signSettingsRequired;
        if (!hasValue(watchConfigVVKId) && isLicensePending()) {
          // Retry up to 10 times with a 5-second delay if the license is pending
          signSettingsRequired = await retry(() => checkLicenseActive(watchConfigTempVendorId), 10, 5000);
        } else {
          signSettingsRequired = await checkLicenseActive(watchConfigTempVendorId);
        }
        // license renewed
        if (signSettingsRequired) await adminClient.tideAdmin.triggerLicenseRenewedEvent({ error: false });
        if (signSettingsRequired) await adminClient.tideAdmin.triggerLicenseRenewedEvent({ error: false });

        if (signSettingsRequired) {
          const initialSessionId = getSingleValue(getValues("config.initialSessionId"));
          const updatedProvider = await adminClient.components.findOne({ id });
          await submitVendorSignUp(updatedProvider!);
          const tempVendorId = getSingleValue(getValues("config.tempVendorId"));
          setValue("config.vendorId", [tempVendorId]);
          setValue("config.tempVendorId", [""]);
          await save();
          await adminClient.tideAdmin.confirmVrk();
          await refresh();
          const tempVendorData = await generateNewVrk();
          const vId: string = tempVendorData?.VendorId ?? ""
          setValue("config.tempVendorId", [vId]);
          await save();


          const updateRequest = {
            InitialSessionId: initialSessionId,
            VendorData: tempVendorData
          };

          const utcNowTimestamp = Date.now();
          const authForm = new FormData();
          authForm.append("data", utcNowTimestamp.toString());
          const sig = await adminClient.tideAdmin.authorizeStripeRequest(authForm);
          await (tideClient as NodeClient).UpdateSubscription(updateRequest, tempVendorId, utcNowTimestamp.toString(), sig.toString());


          //await refreshCallback?.(); // refresh settings page
          await refresh(); // refresh current page

          // check if user has a tideidp, then sign settings.
          const tideIdp = await adminClient.identityProviders.findOne({ alias: "tide" });

          if (tideIdp) {
            //sign settings
            var sigs = await resignSettings(adminClient, realm, tideIdp, realmRepresentation!) // TIDECLOAK IMPLEMENTATION

            tideIdp!.config!["loginURLSig"] = sigs[1]
            tideIdp!.config!["linkTideURLSig"] = sigs[2]
  
            // Vendor Settings signaure
            tideIdp!.config!["settingsSig"] = sigs[sigs.length - 2]
            // Vendor Rotating Public
            tideIdp!.config!["gVRKSig"] = sigs[sigs.length - 1]
  
            await adminClient.identityProviders.update(
              { alias: "tide" },
              {
                ...tideIdp!,
              },
            )
          }

          setIsLoading(false); // Loading is done
          setIsPendingResign(false);
        } else if (!isInitialCheckout) {
          setIsLoading(false);
        } else if (!isInitialCheckout) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error(err);
        // license renewed error
        await adminClient.tideAdmin.triggerLicenseRenewedEvent({ error: true });
        setIsLoading(false);
        setIsInitialCheckout(false);
      }
    };

    if (!isPendingResign && hasValue(watchConfigTempVendorId) && tideClient !== undefined) {
      setIsPendingResign(true);
      setIsLoading(true);
      activateLicense();
    }
  }, [watchConfigTempVendorId, tideClient]);

  useEffect(() => {
    const licenseDetails = JSON.stringify(
      {
        vvkId: watchConfigVVKId,
        customerId: watchConfigCustomerId,
        gVRK: watchConfigGVRK,
        vendorId: watchConfigVendorId,
        payerPub: watchConfigPayerPub
      },
      null,
      2
    );
    setActiveLicenseDetails(licenseDetails);
  }, [watchConfigGVRK, watchConfigPayerPub, watchConfigVendorId, watchConfigVVKId]);

  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      const utcNowTimestamp = Date.now();
      const authForm = new FormData();
      authForm.append("data", utcNowTimestamp.toString());
      const sig = await adminClient.tideAdmin.authorizeStripeRequest(authForm);

      const response = await (tideClient as NodeClient).GetSubscriptionStatus(
        watchConfigVendorId,
        watchConfigInitialSessionId,
        utcNowTimestamp.toString(),
        sig.toString()
      );
      setTempLicenseDetails(JSON.stringify(tempLicenseDetails, null, 2));
      setSubscriptionStatus(response ?? "");
    };

    const tempLicenseDetails = {
      vvkId: watchConfigVVKId,
      customerId: watchConfigCustomerId,
      gVRK: watchConfigTempGVRK,
      vendorId: watchConfigTempVendorId,
      payerPub: watchConfigPayerPub
    };

    if (objectHasValues(tempLicenseDetails) && tideClient !== undefined && hasValue(watchConfigVendorId)) {
      fetchSubscriptionStatus();
    }
  }, [watchConfigTempVendorId, watchConfigPayerPub, watchConfigTempGVRK, watchConfigVVKId, tideClient, watchConfigVendorId]);

  useEffect(() => {
    const fetchLicenseDetails = async () => {
      if (hasValue(activeLicenseDetails)) {
        const utcNowTimestamp = Date.now();
        const authForm = new FormData();
        authForm.append("data", utcNowTimestamp.toString());
        const sig = await adminClient.tideAdmin.authorizeStripeRequest(authForm);

        const response = await (tideClient as NodeClient).GetLicenseDetails(
          watchConfigVendorId,
          utcNowTimestamp.toString(),
          sig.toString()
        );
        if (response === undefined || response.startsWith("Error")) {
          console.log("Error getting license details " + response);
          return;
        }

        const details = JSON.parse(response);
        const date = new Date(details.expiryDate * 1000);
        const day = date.getUTCDate().toString().padStart(2, '0');
        const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // Months are zero-based
        const year = date.getUTCFullYear().toString().slice(-2);
        const formattedDate = `${day}/${month}/${year}`;

        setCurrentUsers(details.currentUserAcc);
        setLicenseMaxUserAcc(watchConfigMaxUserAcc);
        setLicenseExpiry(formattedDate);
      }
    };
    if (hasValue(watchConfigVVKId) && tideClient !== undefined && hasValue(watchConfigVendorId)) {
      fetchLicenseDetails();
    }
  }, [watchConfigVVKId, watchConfigMaxUserAcc, key, tideClient, watchConfigVendorId, activeLicenseDetails]);

  const getPayerUrl = async () => {
    const payer = hasValue(payerUrl)
      ? getSingleValue(payerUrl)
      : await new NetworkClient(getSingleValue(getValues("config.systemHomeOrk"))).GetPayerUrl(watchConfigPayerPub);


    return payer.endsWith("/") ? payer.slice(0, -1) : payer;
  };

  const checkLicenseActive = async (vendorId: string) => {
    try {
      const isActive = await (tideClient as NodeClient).IsLicenseActive(vendorId);
      return isActive;
    } catch (error) {
      console.error('Error checking license:', error);
      return false; // Return false in case of an error
    }
  };

  const refresh = async () => {
    const latest = await adminClient.components.findOne({ id });
    reset(latest);
    setKey(key + 1);
  };

  const save = async (savedProvider?: ComponentRepresentation) => {
    const updatedProvider = await adminClient.components.findOne({ id });
    if (!updatedProvider) {
      throw new Error(t("notFound"));
    }

    const p = savedProvider || getValues();
    const config: ComponentRepresentation = { ...updatedProvider, ...p }
    try {
      await adminClient.components.update(
        { id },
        {
          ...config,
          providerType: KEY_PROVIDER_TYPE,
        },
      );
      addAlert(t("saveProviderSuccess"), AlertVariant.success);
      addAlert(t("newLicenseActivatedIdentityProvider"), AlertVariant.success);
    } catch (error) {
      addAlert(t("newLicenseErrorIdentityProvider"), AlertVariant.danger);
    }
  };

  const handleCheckout = async (licensingTier: string) => {
    try {
      setIsInitialCheckout(true);
      setIsLoading(true);
      const vendorData = await generateNewVrk();
      const redirectUrl = window.location.href.endsWith('/') ? window.location.href.slice(0, -1) : window.location.href;
      const response = await (tideClient as NodeClient).CreateCheckoutSession(vendorData, redirectUrl, licensingTier);

      // Check response is a redirect to stripe checkout
      if (response.status === 303) {
        const body = await response.json();
        // Get the activation package and save it
        await saveActivationPackage(body.activationPackage);
        await save();
        window.location.href = body.redirectUrl;
      }
    } catch (err) {
      setIsLoading(false);
      setIsInitialCheckout(false);

      addAlert(t("Error with checkout"), AlertVariant.danger);
      throw err;
    }
  };

  const saveActivationPackage = async (activationPackage: string) => {
    const activationPackageJson = JSON.parse(activationPackage);
    validateActivationPackage(activationPackageJson);

    const sessionId = activationPackageJson.sessionId;
    const customerId = activationPackageJson.customerId;
    const payerPub = activationPackageJson.payerPublic;
    const maxUserAcc = activationPackageJson.maxUserAcc;

    setValue("config.initialSessionId", [sessionId]);
    setValue("config.customerId", [customerId]);
    setValue("config.payerPublic", [payerPub]);
    setValue("config.maxUserAcc", [maxUserAcc]);
  };

  const generateNewVrk = async () => {
    await adminClient.tideAdmin.generateVrk();
    const updatedProvider = await adminClient.components.findOne({ id });
    reset(updatedProvider);
    const tempgVRK = updatedProvider?.config?.tempgVRK !== undefined ? getSingleValue(updatedProvider?.config?.tempgVRK) : undefined;

    if (tempgVRK !== undefined && hasValue(tempgVRK)) {
      const newPoint = Bytes2Hex((await HashToPoint(Point.g.toArray())).toArray());
      const newFormData = new FormData();
      newFormData.append("point", newPoint);

      const vendorResponse = await adminClient.tideAdmin.generateVendorId(newFormData);
      const vendorId = await vendorResponse.toString();
      setValue("config.tempVendorId", [vendorId]);
      return { GVRK: tempgVRK, VendorId: vendorId };
    } else {
      return null;
    }
  };

  const validateActivationPackage = (activationPackageJson: any) => {
    if (
      !activationPackageJson.gVRK ||
      !activationPackageJson.payerPublic ||
      !activationPackageJson.licenseId ||
      !activationPackageJson.maxUserAcc ||
      !activationPackageJson.sessionId ||
      !activationPackageJson.customerId
    ) {
      throw new Error("Invalid activation package provided");
    }
    // Check if these values match the temp license request
    const gVRK = activationPackageJson.gVRK;
    const vendorId = activationPackageJson.licenseId;
    const tempgVRK = getSingleValue(getValues("config.tempgVRK"));
    const tempVendorId = getSingleValue(getValues("config.tempVendorId"));

    if ((hasValue(tempgVRK) && gVRK !== tempgVRK) || (hasValue(tempVendorId) && vendorId !== tempVendorId)) {
      throw new Error("Incorrect activation package provided, this is for the wrong license request");
    }

    return true;
  };

  const submitVendorSignUp = async (provider: ComponentRepresentation) => {
    try {
      const sessKey = GenSessKey();
      const gSessKey = GetPublic(sessKey);
      // Create new VVK authRequest, sign with VRK
      const tempgVrk = getSingleValue(getValues("config.tempgVRK"));

      // Determine if this is the initial setup
      const isInitialSetup = provider?.config?.vvkId !== undefined ? !hasValue(getSingleValue(provider?.config?.vvkId)) : true;

      const gVRKHex = tempgVrk;
      const gVRKBytes = Hex2Bytes(gVRKHex).slice(3); // to skip component bytes
      const gVRKPoint = Point.decompress(gVRKBytes);

      const VVKid = isInitialSetup
        ? RandomBigInt().toString()
        : getSingleValue(provider?.config?.vvkId!);

      const authForm = new FormData();
      const auth = new AuthRequest(VVKid, "NEW", gSessKey.toBase64(), BigInt(CurrentTime() + 30));
      authForm.append("data", auth.toString());
      const authSigResponse = await adminClient.tideAdmin.signMessage(authForm);
      const authSig = authSigResponse.toString();

      // Create VVK
      let homeOrkUrl: string = getSingleValue(getValues("config.systemHomeOrk"));
      // Remove trailing backslash
      if (homeOrkUrl.endsWith('/')) {
        homeOrkUrl = homeOrkUrl.slice(0, -1);
      }
      const vvkInfo = isInitialSetup
        ? null
        : await new NetworkClient(homeOrkUrl).GetKeyInfo(VVKid);
      const orks = vvkInfo === null
        ? await new NetworkClient(homeOrkUrl).GetMaxORKs() // Get random orks for initial signing
        : vvkInfo.OrkInfo; // Get ork information linked to VVKID for resigning

      const payerPub = encodeURIComponent(getSingleValue(getValues("config.payerPublic")));
      const voucherURL = window.location.origin + `/admin/realms/${realm}/tideAdminResources/new-voucher`;

      // Create the VVK (only run on initial setup)
      const genFlow = isInitialSetup && vvkInfo === null
        ? new dKeyGenerationFlow(VVKid, gVRKPoint.toBase64(), orks, sessKey, gSessKey, "NEW", "").setVoucherRetrievalFunction(async (request: string) => {
          const formData = new FormData();
          formData.append("voucherRequest", request);
          return JSON.stringify(await adminClient.tideAdmin.getVouchers(formData)); // WHY NOT STRING!!!!!!???????
        })
        : null;
      const gK = genFlow === null
        ? vvkInfo!.UserPublic
        : (await genFlow.GenVVKShard(auth.toString(), authSig, ["TidecloakInit:1", "AccessTokenInit:1"])).gK;
      if (genFlow !== null) {
        await genFlow.SetShard(gVRKPoint, "VVK");
      }

      const requestArray = [];

      if (isInitialSetup) {
        requestArray.push(new BaseSignRequest("TidecloakInit", "1", "SinglePublicKey:1", StringToUint8Array(""), StringToUint8Array("")));
        requestArray.push(new BaseSignRequest("AccessTokenInit", "1", "SinglePublicKey:1", StringToUint8Array(""), StringToUint8Array("")));
      }

      requestArray.forEach(async req => {
        const requestForm = new FormData();
        requestForm.append("data", req.dataToAuthorize());
        const proofResponse = await adminClient.tideAdmin.signMessage(requestForm);
        const proof = proofResponse.toString();
        req.addAuthorization(proof);


      })

      const preSigs = requestArray.map(async req => {
        try {
          const signFlow = new dVVKSigningFlow(VVKid, gK, orks, sessKey, gSessKey, "").setVoucherRetrievalFunction(async (request: string) => {
            const formData = new FormData();
            formData.append("voucherRequest", request);
            return JSON.stringify(await adminClient.tideAdmin.getVouchers(formData)); // WHY NOT STRING!!!!!!???????
          });
          const result = signFlow.start(req, isInitialSetup);
          await adminClient.tideAdmin.triggerAuthorizerUpdateEvent({ error: false });
          await adminClient.tideAdmin.triggerAuthorizeEvent({ error: false });
          return result;
        } catch (err) {
          await adminClient.tideAdmin.triggerAuthorizerUpdateEvent({ error: true });
          await adminClient.tideAdmin.triggerAuthorizeEvent({ error: true });
          throw err;
        }

      })

      await Promise.all(preSigs);

      // Commit VVK (only run on initial setup)
      if (genFlow !== null && hasValue(VVKid)) {
        await genFlow.Commit();
        setValue("config.vvkId", [VVKid]);
        setValue("config.clientId", [Bytes2Hex(gK!.toArray())]); // Possibly redundant
        // Vendor key created
        await adminClient.tideAdmin.triggerVendorKeyCreationEvent({ error: false });
      }
    } catch (err) {
      setIsLoading(false);
      addAlert(t("Settings cannot be secured"), AlertVariant.danger);
      // Vendor key created error
      await adminClient.tideAdmin.triggerVendorKeyCreationEvent({ error: true });
      throw err;
    }
  };

  const generateJWK = async () => {
    var content = await adminClient.tideAdmin.getTideJwk();
    var jwk = JSON.stringify(content)
    const blob = new Blob([jwk], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tide-eddsa.jwk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  const handleManageSubscription = async () => {
    if (vendorIdRef.current && timestampRef.current && sigRef.current && redirectRef.current) {

      const redirectUrl = window.location.href.endsWith('/') ? window.location.href.slice(0, -1) : window.location.href;

      const utcNowTimestamp = Date.now();
      const authForm = new FormData();
      authForm.append("data", utcNowTimestamp.toString());

      const sig = await adminClient.tideAdmin.authorizeStripeRequest(authForm);

      // Set values directly using refs
      vendorIdRef.current.value = watchConfigVendorId;
      timestampRef.current.value = utcNowTimestamp.toString();
      sigRef.current.value = sig.toString();
      redirectRef.current.value = redirectUrl;

      // Submit the form programmatically
      if (formRef.current) {
        formRef.current.submit();
      }

    }
  };

  const sections = [
    {
      title: t("Active License"),
      panel: (
        <FormAccess role="manage-identity-providers" isHorizontal>
          {isLoading ? (
            <Spinner size="xl" />
          ) : hasValue(watchConfigVVKId) ? (
            <>
              {/* Existing form groups for active license */}
              <FormGroup
                label={t("License Details")}
                labelIcon={
                  <HelpItem
                    helpText={"This is the details of your current active license. Save a copy locally."}
                    fieldLabelId={"LicenseDetails"}
                  />
                }
                fieldId="active-license-details"
              >
                <ClipboardCopy isCode isReadOnly>{activeLicenseDetails}</ClipboardCopy>
              </FormGroup>

              <FormGroup
                label={t("Expiry Date")}
                labelIcon={
                  <HelpItem
                    helpText={"The expiry date of this active license"}
                    fieldLabelId={"LicenseExpiry"}
                  />
                }
                fieldId="license-expiry"
              >
                <Label>{licenseExpiry}</Label>
              </FormGroup>

              <FormGroup
                label={t("Max User Accounts")}
                labelIcon={
                  <HelpItem
                    helpText={"The max amount of user accounts for this license"}
                    fieldLabelId={"LicenseMaxUserAccounts"}
                  />
                }
                fieldId="license-max-user-accounts"
              >
                <Label>{licenseMaxUserAcc}</Label>
              </FormGroup>

              <FormGroup
                label={t("Current User Accounts")}
                labelIcon={
                  <HelpItem
                    helpText={"The current amount of user accounts on this license"}
                    fieldLabelId={"LicenseCurrentUserAccounts"}
                  />
                }
                fieldId="license-current-user-accounts"
              >
                <Label>{currentUsers}</Label>
              </FormGroup>
              <FormGroup
                label={t("JWK")}
                labelIcon={
                  <HelpItem
                    helpText={"JWK needed for client authentication"}
                    fieldLabelId={"LicenseJWK"}
                  />
                }
                fieldId="license-jwk"
              >
                <Button type="button" onClick={async () => await generateJWK()}>Export</Button>
              </FormGroup>
              <form method="POST" action={payerUrl + "/payer/license/CreateCustomerPortalSession"} ref={formRef}>
                <input type="hidden" name="vendorId" ref={vendorIdRef} />
                <input type="hidden" name="timestamp" ref={timestampRef} />
                <input type="hidden" name="timestampSig" ref={sigRef} />
                <input type="hidden" name="redirectUrl" ref={redirectRef} />
                <Button type="button" onClick={async () => await handleManageSubscription()}>Manage Subscription</Button>
              </form>
            </>
          ) : (
            <>
              {/* Show "No active license found" and "Request License" button */}
              <FormGroup
                fieldId="no-active-license"
              >
                <Text>{t("No active license found.")}</Text>
              </FormGroup>
              <FormGroup
                fieldId="request-license"
              >
                <Button variant="primary" onClick={async () => await handleCheckout(LicensingTiers.Free)}>
                  {t("Request License")}
                </Button>
              </FormGroup>
            </>
          )}
        </FormAccess>
      ),
    },
    {
      title: t("Activity Log"),
      panel: (
        <TideLicenseHistory licenseData={[{ license: tempLicenseDetails, status: subscriptionStatus, date: licenseExpiry }]} />
      )
    },
  ];

  return (
    <>
      <FormAccess role="manage-identity-providers" isHorizontal>
        <ScrollForm
          label={t("jumpToSection")}
          className="pf-v5-u-px-lg"
          sections={sections}
        />
      </FormAccess>
    </>
  );
};
