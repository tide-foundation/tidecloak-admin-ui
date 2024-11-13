import type IdentityProviderRepresentation from "@keycloak/keycloak-admin-client/lib/defs/identityProviderRepresentation";
import {
  ActionGroup,
  AlertVariant,
  Button,
  PageSection,
  Grid,
  GridItem
} from "@patternfly/react-core";
import { useMemo, useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAdminClient } from "../../admin-client";
import { useAlerts } from "@keycloak/keycloak-ui-shared";
import { DynamicComponents } from "../../components/dynamic/DynamicComponents";
import { FormAccess } from "../../components/form/FormAccess";
import { ViewHeader } from "../../components/view-header/ViewHeader";
import { useRealm } from "../../context/realm-context/RealmContext";
import { useServerInfo } from "../../context/server-info/ServerInfoProvider";
import { toUpperCase } from "../../util";
import { useParams } from "../../utils/useParams";
import { toIdentityProvider } from "../routes/IdentityProvider";
import type { IdentityProviderCreateParams } from "../routes/IdentityProviderCreate";
import { toIdentityProviders } from "../routes/IdentityProviders";
import { GeneralSettings } from "./GeneralSettings";
import { Point } from "../../../tide-modules/modules/Cryptide/index";
import { findTideComponent, resignSettings } from "../utils/SignSettingsUtil";

export default function AddIdentityProvider() {
  const { adminClient } = useAdminClient();

  const { t } = useTranslation();
  const { providerId } = useParams<IdentityProviderCreateParams>();
  const form = useForm<IdentityProviderRepresentation>({ mode: "onChange" });
  const serverInfo = useServerInfo();

  const providerInfo = useMemo(() => {
    const namespaces = [
      "org.keycloak.broker.social.SocialIdentityProvider",
      "org.keycloak.broker.provider.IdentityProvider",
    ];

    for (const namespace of namespaces) {
      const social = serverInfo.componentTypes?.[namespace]?.find(
        ({ id }) => id === providerId,
      );

      if (social) {
        return social;
      }
    }
  }, [serverInfo, providerId]);

  const {
    handleSubmit,
    formState: { isValid },
  } = form;

  const { addAlert, addError } = useAlerts();
  const navigate = useNavigate();
  const { realm, realmRepresentation } = useRealm();

  /** TIDECLOAK IMPLEMENTATION START */
  const currentHost = window.location.origin;
  const backgroundUrl = `${currentHost}/realms/${realm}/tide-idp-resources/images/BACKGROUND_IMAGE`;
  const logoUrl = `${currentHost}/realms/${realm}/tide-idp-resources/images/LOGO`;

  useEffect(() => {
    const doStuff = async () => {
      // const obfGVVK = Bytes2Hex((await HashToPoint(Point.g.toArray())).toArray()); // H2P(g) - for sign up
      // form.setValue("config.obfGVVK", obfGVVK, { shouldValidate: true });
      form.setValue("config.ImageURL", backgroundUrl);
      form.setValue("config.LogoURL", logoUrl);
      form.setValue("config.clientSecret", "null");

      const tideComponent = await findTideComponent(adminClient, realm);

      if (tideComponent) {
        try {
          const sigs = await resignSettings(adminClient, realm, form.getValues(), realmRepresentation!);
          if (sigs === undefined) {
            addAlert(t("Signing settings failed"), AlertVariant.warning)
            return;
          }
          form.setValue("config.loginURLSig", sigs[1])
          form.setValue("config.linkTideURLSig", sigs[2])

          // Vendor Settings signaure
          form.setValue("config.settingsSig", sigs[sigs.length - 2])
          // Vendor Rotating Public
          form.setValue("config.gVRKSig", sigs[sigs.length - 1])

        } catch (error) {
          addError("SignSettingsError", error);
        }
      }
    };

    const handleSubmit = async () => {
      if (providerId === "tide") {
        await doStuff();
        onSubmit(form.getValues());
      }
    };

    handleSubmit();
  }, [providerId]);
  /** TIDECLOAK IMPLEMENTATION END */

  const onSubmit = async (provider: IdentityProviderRepresentation) => {
    try {
      await adminClient.identityProviders.create({
        ...provider,
        config: {
          ...provider.config,
        },
        providerId,
        alias: provider.alias!,
      });

      /** TIDECLOAK IMPLEMENTATION END */

      addAlert(t("createIdentityProviderSuccess"), AlertVariant.success);
      navigate(
        toIdentityProvider({
          realm,
          providerId,
          alias: provider.alias!,
          tab: "settings",
        }),
      );
    } catch (error) {
      addError("createError", error);
    }
  };

  /** TIDECLOAK IMPLEMENTATION END */
  const alias = form.getValues("alias");

  if (!alias) {
    form.setValue("alias", providerId);
  }

  return (
    <>
      <ViewHeader
        titleKey={t("addIdentityProvider", {
          provider: toUpperCase(providerId),
        })}
      />
      <PageSection variant="light">
        <Grid hasGutter>
          <GridItem span={12} md={8}>
            <FormAccess
              role="manage-identity-providers"
              isHorizontal
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormProvider {...form}>
                <GeneralSettings id={providerId} />
                {providerInfo && (
                  <DynamicComponents
                    stringify
                    properties={providerInfo.properties}
                    isTideProvider={providerId === "tide"}
                  />
                )}
              </FormProvider>
              <ActionGroup>
                {providerId !== "tide" && (<Button
                  isDisabled={!isValid}
                  variant="primary"
                  type="submit"
                  data-testid="createProvider"
                >
                  {t("add")}
                </Button>
                )}
                <Button
                  variant="link"
                  data-testid="cancel"
                  component={(props) => (
                    <Link {...props} to={toIdentityProviders({ realm })} />
                  )}
                >
                  {t("cancel")}
                </Button>
              </ActionGroup>
            </FormAccess>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};
