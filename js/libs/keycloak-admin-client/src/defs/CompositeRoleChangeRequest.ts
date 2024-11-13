import type RequestedChanges from "./RequestedChanges.js";
export default interface CompositeRoleChangeRequest extends RequestedChanges {
    role: string;
    compositeRole: string;
}

