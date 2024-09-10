import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address, CommonMessageInfoRelaxed, MessageRelaxed, Message } from '@ton/core';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { JettonMinter } from '../wrappers/JettonMinter';
import { SalesV1 } from '../wrappers/Sales-v1';

describe('JettonWallet', () => {
    let salesV1Code: Cell;
    let jettonWalletCode: Cell;
    let salesV1sc: SandboxContract<SalesV1>;
    let jettonMinter: SandboxContract<JettonMinter>;

    beforeAll(async () => {
        salesV1Code = await compile('SalesV1');
        jettonWalletCode = await compile('JettonWallet');
    });
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        jettonMinter = await blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: deployer.address!,
                    content: beginCell().endCell(),
                    jwallet_code: jettonWalletCode,
                },
                jettonWalletCode
            )
        )
    })

    it('should get sales v1 data after contract has been deployed', async () => {
        salesV1sc = blockchain.openContract(
            SalesV1.createFromConfig(
                {
                   owner: deployer.address,
                   minter: jettonMinter.address
                },
                salesV1Code,
            ),
        );
        const deployResult = await salesV1sc.sendDeploy(deployer.getSender(), toNano('0.05'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: salesV1sc.address,
            deploy: true,
            success: true
        })
        const contractData = await salesV1sc.getContractData();
        expect(contractData.minter_address).toEqualAddress(jettonMinter.address);
        // expect(contractData.jetton_balance).toBe(5000n);
    })
})