import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano,
} from '@ton/core';

export type JettonMinterConfig = {
    admin: Address;
    content: Cell;
    jwallet_code: Cell;
};
export type JettonMinterContent = {
    type: 0 | 1;
    uri: string;
};

export function jettonContentToCell(content: JettonMinterContent) {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}

export function jettonMinterConfigToCell(config: JettonMinterConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.admin)
        .storeRef(config.content)
        .storeRef(config.jwallet_code)
        .endCell();
}

export class JettonMinter implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinter(address);
    }

    static createFromConfig(config: JettonMinterConfig, code: Cell, workchain = 0) {
        const data = jettonMinterConfigToCell(config);
        const init = { code, data };
        return new JettonMinter(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    static mintMessage(to: Address, jetton_amount: bigint, forward_ton_amount: bigint, total_ton_amount: bigint) {
        return beginCell()
            .storeUint(21, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(to)
            .storeCoins(jetton_amount)
            .storeCoins(forward_ton_amount)
            .storeCoins(total_ton_amount)
            .endCell();
    }
    async sendMint(
        provider: ContractProvider,
        via: Sender,
        to: Address,
        jetton_amount: bigint,
        forward_ton_amount: bigint,
        total_ton_amount: bigint,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.mintMessage(to, jetton_amount, forward_ton_amount, total_ton_amount),
            value: total_ton_amount + toNano('0.1'),
        });
    }
    static changeAdminMessage(newOwner: Address) {
        return beginCell()
            .storeUint(3, 32)
            .storeUint(0, 64) // op, queryId
            .storeAddress(newOwner)
            .endCell();
    }

    async sendChangeAdmin(provider: ContractProvider, via: Sender, newOwner: Address) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinter.changeAdminMessage(newOwner),
            value: toNano('0.1'),
        });
    }
    // GETTERS
    async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
        const res = await provider.get('get_wallet_address', [
            { type: 'slice', cell: beginCell().storeAddress(owner).endCell() },
        ]);
        return res.stack.readAddress();
    }

    async getJettonData(provider: ContractProvider) {
        let res = await provider.get('get_jetton_data', []);
        let totalSupply = res.stack.readBigNumber();
        let mintable = res.stack.readBoolean();
        let adminAddress = res.stack.readAddress();
        let content = res.stack.readCell();
        let walletCode = res.stack.readCell();
        return {
            totalSupply,
            mintable,
            adminAddress,
            content,
            walletCode,
        };
    }
    async getJettonWalletAddress(provider: ContractProvider, owner: Address) {
        const res = await provider.get('get_wallet_address',
             [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }])
        return res.stack.readAddress();
    }
    async getTotalSupply(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.totalSupply;
    }
    async getAdminAddress(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.adminAddress;
    }
    async getContent(provider: ContractProvider) {
        let res = await this.getJettonData(provider);
        return res.content;
    }
    async getJettonBalance(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('get_jetton_data', []);
        return res.stack.readBigNumber();
    }
}
