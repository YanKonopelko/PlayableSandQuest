import { Component, Node } from 'cc';

export class RequiredReference {
    public static Check(owner: Component, value: unknown, fieldName: string): boolean {
        if (value !== null && value !== undefined) {
            return true;
        }

        console.error(`[${owner.constructor.name}] Required reference is not assigned: ${fieldName}`, owner.node?.name);
        return false;
    }

    public static CheckNode(owner: Component, node: Node | null, fieldName: string): boolean {
        return RequiredReference.Check(owner, node, fieldName);
    }
}
