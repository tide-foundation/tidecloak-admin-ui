import type { ConfigPropertyRepresentation } from "@keycloak/keycloak-admin-client/lib/defs/authenticatorConfigInfoRepresentation";

import { COMPONENTS, isValidComponentType } from "./components";
import { convertAttributeNameToForm } from "../../util";

type DynamicComponentProps = {
  properties: ConfigPropertyRepresentation[];
  stringify?: boolean;
  isNew?: boolean;
  isTideProvider?: boolean; //TIDECLOAK IMPLEMENTATION
};
const tideProviderShowComponentList = [
  "ImageURL",
  "LogoURL",
  "backupOn",
  "homeORKurl"
]

export const DynamicComponents = ({
  properties,
  isTideProvider = false,
  ...rest
}: DynamicComponentProps) => (
  <>
    {properties.map((property) => {
      const componentType = property.type!;
      if (isValidComponentType(componentType)) {
        const isHidden = isTideProvider && !tideProviderShowComponentList.includes(property.name!) ? true : false;
        const Component = COMPONENTS[componentType];
        return <Component key={property.name} {...property} {...rest} isHidden={isHidden} />;
      } else {
        console.warn(`There is no editor registered for ${componentType}`);
      }
    })}
  </>
);

export const convertToName = (name: string): string =>
  convertAttributeNameToForm(`config.${name}`);
