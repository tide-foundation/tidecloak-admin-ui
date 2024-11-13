import type RequestedChanges from "./RequestedChanges.js";
export default interface RoleChangeRequest extends RequestedChanges {
    role: string;
}

