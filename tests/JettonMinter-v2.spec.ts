import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { JettonMinter } from '../wrappers/JettonMinter';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('JettonMinter v2', () => {
    let minterCode: Cell;
    let jettonWalletCode: Cell;
    let masterContractContent: Cell;

    beforeAll(async () => {
        minterCode = await compile('JettonMinter');
        jettonWalletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinter: SandboxContract<JettonMinter>;
    let nonDeployer: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('non-deployer');
        masterContractContent = beginCell().endCell();

        jettonMinter = blockchain.openContract(
            JettonMinter.createFromConfig(
                {
                    admin: deployer.address!,
                    content: masterContractContent,
                    jwallet_code: jettonWalletCode,
                },
                minterCode,
            ),
        );

        const deployResult = await jettonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinter.address,
            deploy: true,
            success: true,
        });
    });
    it('should deposit tons when empty message body ', async () => {
        const result = await nonDeployer.send({
            to: jettonMinter.address,
            value: toNano('1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        expect(result.transactions).toHaveTransaction({
            from: nonDeployer.address,
            to: jettonMinter.address,
            value: toNano('1'),
            success: true
        });
    });

    it('should withdraw tons when get op:withdraw message from owner ', async () => {
        // deposit funds
        const result = await nonDeployer.send({
            to: jettonMinter.address,
            value: toNano('1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        const withdrawResult = await jettonMinter.sendWithdrawFunds(deployer.getSender(), toNano('0.5'));
        console.log('jettonMinter.address ', jettonMinter.address.toString());
        console.log('deployer.address ', deployer.address.toString());
        expect(withdrawResult.transactions).toHaveTransaction({
            from: jettonMinter.address,
            to: deployer.address,
            success: true,
            value: toNano('0.5')
        })
    });

    it('should reject to withdraw more than it has on the balance ', async () => {
        const contractBalance = toNano('0.05');
        const withdrawResult = await jettonMinter.sendWithdrawFunds(deployer.getSender(), (contractBalance + toNano('0.5')));
        expect(withdrawResult.transactions).toHaveTransaction({
            to: jettonMinter.address,
            from: deployer.address,
            success: false,
            exitCode: 104
        })
    });
});
