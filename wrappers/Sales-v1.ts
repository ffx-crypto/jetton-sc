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

export type SalesV1Config = {
    owner: Address,
    minter: Address
};

export function salesV1ConfigToCell(config: SalesV1Config): Cell {
    return beginCell()
        .storeAddress(config.owner)
        .storeAddress(config.minter)
        .endCell();
}

export class SalesV1 implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new SalesV1(address);
    }

    static createFromConfig(config: SalesV1Config, code: Cell, workchain = 0) {
        const data = salesV1ConfigToCell(config);
        const init = { code, data };
        return new SalesV1(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
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
            body: SalesV1.changeAdminMessage(newOwner),
            value: toNano('0.1'),
        });
    }
    // GETTERS
    async getContractData(provider: ContractProvider) {
        let res = await provider.get('get_sales_data', []);
        return {
            // jetton_balance: res.stack.readBigNumber(),
            owner_address: res.stack.readAddress(),
            minter_address: res.stack.readAddress(),
            // jwallet_code: res.stack.readCell(),
        };
    }
}
