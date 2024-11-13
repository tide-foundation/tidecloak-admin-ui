import type IdentityProviderRepresentation from "@keycloak/keycloak-admin-client/lib/defs/identityProviderRepresentation";

import { useServerInfo } from "../../context/server-info/ServerInfoProvider";
import { addTrailingSlash, KEY_PROVIDER_TYPE } from "../../util";
import { GenSessKey, GetPublic } from "../../../tide-modules/modules/Cryptide/Math";
import { Bytes2Hex, Hex2Bytes, StringToUint8Array } from "../../../tide-modules/modules/Cryptide/Serialization";
import { Point } from "../../../tide-modules/modules/Cryptide/index";
import NetworkClient from "../../../tide-modules/modules/TideJS/Clients/NetworkClient";
import BaseSignRequest from "../../../tide-modules/modules/TideJS/Models/BaseSignRequest";
import dVVKSigningFlow from "../../../tide-modules/modules/TideJS/Flow/SigningFlows/dVVKSigningFlow";
import VendorSettings from "../../../tide-modules/modules/TideJS/Models/VendorSettings";
import HashToPoint from "../../../tide-modules/modules/Cryptide/Hashing/H2P";
import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import type { ServerInfoRepresentation } from "@keycloak/keycloak-admin-client/lib/defs/serverInfoRepesentation";



function getSingleValue(value: string | string[]): string {
    return Array.isArray(value) ? value[0] : value;
}

export const resignSettings = async (adminClient: KeycloakAdminClient, realm: string, identityRep: IdentityProviderRepresentation, realmRepresentation: RealmRepresentation ) => {
    try {

        // check if tide keys exists
        const components = await adminClient.components.find({
            realm: realm,
            type: 'org.keycloak.keys.KeyProvider',
        });
        const tideComponent = components.find(c => c.providerId === "tide-vendor-key");

        if (tideComponent === undefined) {
            throw new Error("No Tide EDDSA Keys")
        }

        const sessKey = GenSessKey();
        const gSessKey = GetPublic(sessKey);
        // Create newVVK authRequest, sign with VRK
        const currentgVrk = getSingleValue(tideComponent!.config!.gVRK) //getValues("config.gVRK");
        const gVRKHex = currentgVrk;
        const gVRKBytes = Hex2Bytes(gVRKHex).slice(3); // to skip component bytes

        const gVRKPoint = Point.decompress(gVRKBytes);
        const VVKid = getSingleValue(tideComponent!.config!.vvkId)

        // Create VVK
        let homeOrkUrl: string = getSingleValue(tideComponent!.config!.systemHomeOrk);
        // remove trailing backslash
        if (homeOrkUrl.endsWith('/')) {
            homeOrkUrl = homeOrkUrl.slice(0, -1);
        }
        const vvkInfo = (await new NetworkClient(homeOrkUrl).GetKeyInfo(VVKid))
        const orks = vvkInfo.OrkInfo;
        const payerPub = encodeURIComponent(getSingleValue(tideComponent!.config!.payerPublic));
        const voucherURL = window.location.origin + `/admin/realms/${realm}/tideAdminResources/new-voucher`;
        const gK = vvkInfo.UserPublic;
        // Sign Vendor Settings + All of the URLs
        const settings = new VendorSettings(realmRepresentation!.registrationAllowed!, false, identityRep!.config!.ImageURL, identityRep!.config!.LogoURL);

        const loginEndpoint = `${addTrailingSlash(
            adminClient.baseUrl,
        )}realms/${realm}/broker/tide/endpoint`;
        const linkTideAccEndpoint = `${addTrailingSlash(
            adminClient.baseUrl,
        )}realms/${realm}/login-actions/required-action`;
        const urls = [];
        urls.push(loginEndpoint);
        urls.push(linkTideAccEndpoint);
        urls.unshift(window.location.origin); // THIS PAGE's LOCATION! MAKE SURE TO HOST THIS PAGE IN YOUR VENDOR's DOMAIN

        const draft = JSON.stringify(urls) + "|" + settings.toString() + "|" + gVRKPoint.toBase64();
        const requestForm = new FormData();
        const request = new BaseSignRequest("TidecloakUpdateSettings", "1", "SinglePublicKey:1", StringToUint8Array(draft), StringToUint8Array(""));
        requestForm.append("data", request.dataToAuthorize());
        const proofResponse = await adminClient.tideAdmin.signMessage(requestForm);
        const proof = proofResponse.toString();
        request.addAuthorization(proof);

        // get gK from simulatorClient GetKeyInfo(vvkid, null)
        
        let sigs;
        try {
            const signFlow = new dVVKSigningFlow(VVKid, gK, orks, sessKey, gSessKey, voucherURL).setVoucherRetrievalFunction(async (request: string) => {
                const formData = new FormData();
                formData.append("voucherRequest", request);
                return JSON.stringify(await adminClient.tideAdmin.getVouchers(formData)); // WHY NOT STRING!!!!!!???????
              });
            sigs = await signFlow.start(request, true);
            await adminClient.tideAdmin.triggerAuthorizeEvent({ error: false });
        } catch (err) {
            // authorize error
            await adminClient.tideAdmin.triggerAuthorizeEvent({ error: true });
            throw err;
        }
        return sigs;
    } catch (err) {
        throw err;
    }

}

export const findTideComponent = async (adminClient: KeycloakAdminClient, realm: string) => {
    const components = await adminClient.components.find({
        realm: realm,
        type: KEY_PROVIDER_TYPE,
    });
    return components.find((c) => c.providerId === "tide-vendor-key");
};

export const createTideComponent = async (adminClient: KeycloakAdminClient, realm: string, serverInfo: ServerInfoRepresentation) => {
    const allComponentTypes = serverInfo.componentTypes?.[KEY_PROVIDER_TYPE];
    const tideProps = allComponentTypes?.find((type) => type.id === "tide-vendor-key")?.properties;

    const keyValueProps = (tideProps ?? []).reduce((acc, prop) => {
        if (prop.defaultValue && typeof prop.defaultValue === "string") {
            acc[prop.name!] = [prop.defaultValue]; // Wrap the string in an array
        } else {
            acc[prop.name!] = []; // Assign an empty array if defaultValue is undefined or not a string
        }
        return acc;
    }, {} as { [key: string]: string[] }); // Ensuring the value is always string[]

    const newComponent = {
        name: "tide-vendor-key",
        config: Object.fromEntries(
            Object.entries(keyValueProps).map(([key, value]) => [
                key,
                Array.isArray(value) ? value : [value],
            ])
        ),
    };

    const obfGVVK = Bytes2Hex((await HashToPoint(Point.g.toArray())).toArray());
    newComponent.config["obfGVVK"] = [obfGVVK];

    await adminClient.components.create({
        ...newComponent,
        providerId: "tide-vendor-key",
        providerType: KEY_PROVIDER_TYPE,
    });

    return await findTideComponent(adminClient, realm);
};