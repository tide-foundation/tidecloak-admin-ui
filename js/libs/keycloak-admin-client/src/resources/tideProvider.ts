import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";

/* TIDECLOAK IMPLEMENTATION */
export class TideProvider extends Resource<{ realm?: string }> {

    public getVouchers = this.makeRequest<FormData, string>({
        method: "POST",
        path: "/tideAdminResources/new-voucher"
    });

    public uploadImage = this.makeRequest<FormData, Record<string, string>>({
        method: "POST",
        path: "/tide-idp-admin-resources/images/upload",
    });

    public getImageName = this.makeRequest<{ type: string }, string | null>({
        method: "GET",
        path: "/tide-idp-admin-resources/images/{type}/name",
        urlParamKeys: ["type"],
        catchNotFound: true,
    });

    public deleteImage = this.makeRequest<{ type: string }, Response>({
        method: "DELETE",
        path: "/tide-idp-admin-resources/images/{type}/delete",
        urlParamKeys: ["type"],
        catchNotFound: true,
    });

    public generateVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/generate-vrk",
    });

    public confirmVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/confirm-vrk",
    });

    public clearTempVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/clear-temp-vrk",
    });


    public generateVendorId = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/generate-vendor-id",
    });

    public signMessage = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/sign-message",
    });
    
    public authorizeStripeRequest = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/authorize-stripe-request",
    });

    public getTideJwk = this.makeRequest<void, Response>({
        method: "GET",
        path: "/vendorResources/get-tide-jwk",
    });

    public toggleIGA = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/tideAdminResources/toggle-iga",
    });

    public triggerLicenseRenewedEvent = this.makeRequest<{error: boolean}, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerLicenseRenewedEvent/{error}"
    })
    public triggerVendorKeyCreationEvent = this.makeRequest<{error: boolean}, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerVendorKeyCreationEvent/{error}"
    })
    public triggerAuthorizerUpdateEvent = this.makeRequest<{error: boolean}, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerAuthorizerUpdateEvent/{error}"
    })
    public triggerAuthorizeEvent = this.makeRequest<{error: boolean}, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerAuthorizeEvent/{error}"
    })
    constructor(client: KeycloakAdminClient) {
        super(client, {
            path: "/admin/realms/{realm}",
            getUrlParams: () => ({
                realm: client.realmName,
            }),
            getBaseUrl: () => client.baseUrl,
        });
    }
}