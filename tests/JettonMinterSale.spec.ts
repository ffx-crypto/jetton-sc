import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, beginCell, Cell, SendMode, toNano } from '@ton/core';
import { JettonMinterSale } from '../wrappers/JettonMinterSale';
import { JettonWallet } from '../wrappers/JettonWallet';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('JettonMinterSale v2', () => {
    let minterCode: Cell;
    let jettonWalletCode: Cell;
    let masterContractContent: Cell;

    beforeAll(async () => {
        minterCode = await compile('JettonMinterSale');
        jettonWalletCode = await compile('JettonWallet');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let jettonMinterSale: SandboxContract<JettonMinterSale>;
    let nonDeployer: SandboxContract<TreasuryContract>;
    let nonDeployerJettonWallet: SandboxContract<JettonWallet>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        nonDeployer = await blockchain.treasury('non-deployer');
        masterContractContent = beginCell().endCell();

        jettonMinterSale = blockchain.openContract(
            JettonMinterSale.createFromConfig(
                {
                    admin: deployer.address!,
                    content: masterContractContent,
                    jwallet_code: jettonWalletCode,
                },
                minterCode,
            ),
        );

        const deployResult = await jettonMinterSale.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinterSale.address,
            deploy: true,
            success: true,
        });
    });
    it('should deposit tons when empty message body ', async () => {
        const result = await nonDeployer.send({
            to: jettonMinterSale.address,
            value: toNano('1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        expect(result.transactions).toHaveTransaction({
            from: nonDeployer.address,
            to: jettonMinterSale.address,
            value: toNano('1'),
            success: true
        });
    });

    it('should withdraw tons when get op:withdraw message from owner ', async () => {
        // deposit funds
        const result = await nonDeployer.send({
            to: jettonMinterSale.address,
            value: toNano('1'),
            sendMode: SendMode.PAY_GAS_SEPARATELY,
        });

        const withdrawResult = await jettonMinterSale.sendWithdrawFunds(deployer.getSender(), toNano('0.5'));
        
        expect(withdrawResult.transactions).toHaveTransaction({
            from: jettonMinterSale.address,
            to: deployer.address,
            success: true,
            value: toNano('0.5')
        })
    });

    it('should reject to withdraw more than it has on the balance ', async () => {
        const contractBalance = toNano('0.05');
        const withdrawResult = await jettonMinterSale.sendWithdrawFunds(deployer.getSender(), (contractBalance + toNano('0.5')));
        expect(withdrawResult.transactions).toHaveTransaction({
            to: jettonMinterSale.address,
            from: deployer.address,
            success: false,
            exitCode: 104
        })
    });

    it('should mint jettons and send to the seller when recieve op::buy message ', async () => {
        const buyResult = await jettonMinterSale.sendBuy(nonDeployer.getSender(), toNano('0.00001'), toNano('0.5'));
        expect(buyResult.transactions).toHaveTransaction({
            from: jettonMinterSale.address,
            success: true,
            deploy: true
        });
        const JWalletAddress = await jettonMinterSale.getJettonWalletAddress(nonDeployer.address);
        nonDeployerJettonWallet = await blockchain.openContract(JettonWallet.createFromAddress(JWalletAddress));
        const jettonBalance = await nonDeployerJettonWallet.getJettonBalance();
        expect(jettonBalance).toBe(90n)
    });

    it('should throw error when sent not enough tons with op::buy message ', async () => {
        const tokenPrice = toNano('0.005');
        const storageFee = toNano('0.05');
        const totalTonAmount = tokenPrice + storageFee - toNano('0.002');
        const buyResult = await jettonMinterSale.sendBuy(
            nonDeployer.getSender(),
            toNano('0.000000001'), // forward ton amount
            totalTonAmount
         );
         console.log('JettonMinterSale.address ', jettonMinterSale.address.toString());
        console.log('deployer.address ', deployer.address.toString());
        console.log('nonDeployer.address ', nonDeployer.address.toString());
        expect(buyResult.transactions).toHaveTransaction({
            to: jettonMinterSale.address,
            from: nonDeployer.address,
            op: parseInt("0xea06185d"), // op::buy()
            // deploy: true,
            success: false,
            exitCode: 76
        })
    });

    it('should destroy contract when recieve message with op::destroy() ', async () => {
        expect((await blockchain.getContract(jettonMinterSale.address)).accountState?.type).toBe('active');
        const result = await jettonMinterSale.sendDestroy(deployer.getSender());
        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinterSale.address,
            op: 1499400124, // op::destroy()
            success: true
        })
        expect((await blockchain.getContract(jettonMinterSale.address)).accountState?.type).toBe(undefined);
        // const getterResult = await jettonMinterSale.getMinterBalance();
        // expect(getterResult).toEqual(0n);
        // const jettonMinterData = await jettonMinterSale.get
    });

    it('should reject op::destroy() message from not-owner ', async () => {
        const result = await jettonMinterSale.sendDestroy(nonDeployer.getSender());
        expect(result.transactions).toHaveTransaction({
            from: nonDeployer.address,
            to: jettonMinterSale.address,
            exitCode: 73,
            success: false
        })
        expect((await blockchain.getContract(jettonMinterSale.address)).accountState?.type).toBe('active');
        
    });

    it('should be upgradable with op::upgrade() message ', async () => {
        // BEFORE
        // initial contract has 'get_minter_balance' method
        let balance = await jettonMinterSale.getMinterBalance();
        expect(Number(balance)/1000000000).toBeCloseTo(Number(toNano('0.05'))/1000000000);
        // jetton supply rests the same
        const mintResult = await jettonMinterSale.sendMint(deployer.getSender(), nonDeployer.
        address, 11n, 1n, toNano('0.000001'));
        const supply = await jettonMinterSale.getTotalSupply();
        expect(supply).toBe(11n);
        
        // AFTER
        const newJettonMinterCode = await compile('JettonMinter');
        const upgradeResult = await jettonMinterSale.sendUpgradeMessage(deployer.getSender(), newJettonMinterCode);
      
        expect(upgradeResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: jettonMinterSale.address,
            op: parseInt("0x2508d66a"),
            success: true
        });
        // jetton supply of the new contract is the same as of the old one
        const newContractSupply = await jettonMinterSale.getTotalSupply();
        expect(newContractSupply).toBe(11n);
        // new contract doesn't have 'get_minter_balance' so throws 11 exit_code
        await expect(jettonMinterSale.getMinterBalance()).rejects.toThrow("Unable to execute get method. Got exit_code: 11");
    });
});
