import { useTranslation } from "react-i18next";
import { PasswordControl, TextControl } from "@keycloak/keycloak-ui-shared";

export const ClientIdSecret = ({
  secretRequired = true,
  create = true,
  isTideIdp = false,
}: {
  secretRequired?: boolean;
  create?: boolean;
  isTideIdp?: boolean;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <TextControl
        isDisabled={isTideIdp}
        name="config.clientId"
        label={t("clientId")}
        labelIcon={t("clientIdHelp")}
        rules={
          isTideIdp ? {} : { required: t("required") }
        }

      />
      <PasswordControl
        isTideIdp={isTideIdp}
        isDisabled={isTideIdp}
        name="config.clientSecret"
        label={t("clientSecret")}
        labelIcon={t("clientSecretHelp")}
        hasReveal={create}
        rules={{ required: { value: secretRequired, message: t("required") } }}
      />
    </>
  );
};
