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

export type JettonMinterSaleConfig = {
    admin: Address;
    content: Cell;
    jwallet_code: Cell;
};
export type JettonMinterSaleContent = {
    type: 0 | 1;
    uri: string;
};

export function jettonContentToCell(content: JettonMinterSaleContent): Cell {
    return beginCell()
        .storeUint(content.type, 8)
        .storeStringTail(content.uri) //Snake logic under the hood
        .endCell();
}

export function JettonMinterSaleConfigToCell(config: JettonMinterSaleConfig): Cell {
    return beginCell()
        .storeCoins(0)
        .storeAddress(config.admin)
        .storeRef(config.content)
        .storeRef(config.jwallet_code)
        .endCell();
}

export class JettonMinterSale implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new JettonMinterSale(address);
    }

    public static createFromConfig(config: JettonMinterSaleConfig, code: Cell, workchain = 0) {
        const data = JettonMinterSaleConfigToCell(config);
        const init = { code, data };
        return new JettonMinterSale(contractAddress(workchain, init), init);
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
            body: JettonMinterSale.mintMessage(to, jetton_amount, forward_ton_amount, total_ton_amount),
            value: total_ton_amount + toNano('0.1'),
        });
    }
    
    static buyMessage(forward_ton_amount: bigint, total_ton_amount: bigint) {
        return beginCell()
            .storeUint(0xea06185d, 32)
            .storeUint(0, 64)
            .storeCoins(forward_ton_amount)
            .storeCoins(total_ton_amount)
            .endCell();
    }

    async sendBuy(
        provider: ContractProvider,
        via: Sender,
        forward_ton_amount: bigint,
        total_ton_amount: bigint,
    ) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinterSale.buyMessage(forward_ton_amount, total_ton_amount),
            value: total_ton_amount + toNano('0.058'),
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
            body: JettonMinterSale.changeAdminMessage(newOwner),
            value: toNano('0.1'),
        });
    }

    static withdrawMessage(amount: bigint) {
        return beginCell()
            .storeUint(0x3aa870a6, 32)
            .storeUint(0, 64)
            .storeCoins(amount)
            .endCell()
    }
    async sendWithdrawFunds(provider: ContractProvider, via: Sender, amount: bigint) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinterSale.withdrawMessage(amount),
            value: toNano('0.002')
        })
    }

    static destroyMessage() {
        return beginCell()
            .storeUint(0x595f07bc, 32) // op::destroy()
            .storeUint(0, 64) 
            .endCell()
    }
    async sendDestroy(provider: ContractProvider, via: Sender) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinterSale.destroyMessage(),
            value: toNano('0.01')
        })
    }

    static upgradeMessage(updContract: Cell) {
        return beginCell()
            .storeUint(0x2508d66a, 32)
            .storeUint(0, 64)
            .storeRef(updContract)
            .endCell()
    }
    async sendUpgradeMessage(provider: ContractProvider, via: Sender, contract: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinterSale.upgradeMessage(contract),
            value: toNano('0.01')
        })
    }

    static changeContentMessage(newContent: Cell) {
        return beginCell()
            .storeUint(4, 32)
            .storeUint(0, 64)
            .storeRef(newContent)
            .endCell();
    }
    async sendChangeContentMessage(provider: ContractProvider, via: Sender, content: Cell) {
        await provider.internal(via, {
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: JettonMinterSale.changeContentMessage(content),
            value: toNano('0.01')
        })
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
    async getMinterBalance(provider: ContractProvider): Promise<bigint> {
        const res = await provider.get('get_minter_balance', []);
        return res.stack.readBigNumber();
    }
}
