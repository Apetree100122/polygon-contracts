import {BigNumber, BigNumberish} from "@ethersproject/bignumber";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    StMATIC,
    PoLidoNFT,
    ValidatorShareMock,
    NodeOperatorRegistry,
    Polygon,
    StakeManagerMock,
    FxBaseRootMock,
    FxBaseRootMock__factory,
    SelfDestructor,
    ERC721Test
} from "../typechain";
import {describe} from "mocha";

describe("Starting to test StMATIC contract", () => {
    let deployer: SignerWithAddress;
    let testers: SignerWithAddress[] = [];
    let insurance: SignerWithAddress;
    let stMATIC: StMATIC;
    let poLidoNFT: PoLidoNFT;
    let nodeOperatorRegistry: NodeOperatorRegistry;
    let mockStakeManager: StakeManagerMock;
    let mockERC20: Polygon;
    let fxBaseRootMock: FxBaseRootMock;
    let erc721Contract: ERC721Test;

    let accounts: SignerWithAddress[];
    let signer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    let submit: (
            signer: SignerWithAddress,
            amount: BigNumberish
    ) => Promise<void>;

    let requestWithdraw: (
            signer: SignerWithAddress,
            amount: BigNumberish
    ) => Promise<void>;

    let claimTokens: (
            signer: SignerWithAddress,
            tokenId: BigNumberish
    ) => Promise<void>;

    let addOperator: (
            validatorId: string,
            rewardAddress: string,
    ) => Promise<void>;

    let stakeOperator: (
            user: SignerWithAddress,
    ) => Promise<void>;

    let mint: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>;

    let slash: (
            validatorId: BigNumberish,
            percentage: BigNumberish
    ) => Promise<void>;

    let getValidatorShare: (validatorId: BigNumberish) => Promise<ValidatorShareMock>
    let getValidatorShareAddress: (validatorId: BigNumberish) => Promise<string>;

    let stopOperator: (id: BigNumberish) => Promise<void>;

    let increaseStakeFor: (validatorId: BigNumber, amount: BigNumber) => Promise<void>

    before(async () => {
        accounts = await ethers.getSigners();
        signer = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        mint = async (signer, amount) => {
            const signerERC = mockERC20.connect(signer);
            await signerERC.mint(amount);
        };

        submit = async (signer, amount) => {
            const signerERC20 = mockERC20.connect(signer);
            await signerERC20.approve(stMATIC.address, amount);

            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.submit(amount);
        };

        requestWithdraw = async (signer, amount) => {
            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.approve(stMATIC.address, amount);
            await signerStMATIC.requestWithdraw(amount);
        };

        claimTokens = async (signer, tokenId) => {
            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.claimTokens(tokenId);
        };

        slash = async (validatorId, percentage) => {
            if (percentage <= 0 || percentage > 100) {
                throw new RangeError("Percentage not in valid range");
            }

            const validatorShareAddress = (
                    await nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                    "ValidatorShareMock"
            );
            const validatorShare = ValidatorShareMock.attach(
                    validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance = await mockERC20.balanceOf(
                    validatorShareAddress
            );

            await validatorShare.slash(
                    validatorShareBalance.mul(percentage).div(100)
            );
        };

        addOperator = async (validatorId, rewardAddress) => {
            await nodeOperatorRegistry.addNodeOperator(
                    validatorId,
                    rewardAddress
            );
        };

        getValidatorShare = async (validatorId) => {
            const validatorShareAddress = (
                    await nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory("ValidatorShareMock");
            return ValidatorShareMock.attach(validatorShareAddress) as ValidatorShareMock;
        };

        getValidatorShareAddress = async (validatorId) => {
            const {validatorShare} = await nodeOperatorRegistry[
                    "getNodeOperator(uint256)"
                    ].call(this, validatorId);
            return validatorShare;
        };

        stakeOperator = async (user) => {
            await mockStakeManager.connect(user)
                    .stakeFor(
                            user.address,
                            toEth("10"),
                            toEth("10"),
                            true,
                            ethers.utils.hexZeroPad("0x01", 64)
                    )
        };
    });

    beforeEach(async () => {
        [deployer, ...testers] = await ethers.getSigners();

        insurance = testers[9];

        mockERC20 = (await (
                await ethers.getContractFactory("Polygon")
        ).deploy()) as Polygon;
        await mockERC20.deployed();

        poLidoNFT = (await upgrades.deployProxy(
                await ethers.getContractFactory("PoLidoNFT"),
                ["PoLidoNFT", "LN", ethers.constants.AddressZero]
        )) as PoLidoNFT;
        await poLidoNFT.deployed();

        erc721Contract = (await (
                await ethers.getContractFactory("ERC721Test")
        ).deploy()) as ERC721Test;
        await erc721Contract.deployed();

        mockStakeManager = (await (
                await ethers.getContractFactory("StakeManagerMock")
        ).deploy(mockERC20.address, erc721Contract.address)) as StakeManagerMock;
        await mockStakeManager.deployed();


        nodeOperatorRegistry = (await upgrades.deployProxy(
                await ethers.getContractFactory("NodeOperatorRegistry"),
                [
                    mockStakeManager.address,
                    mockERC20.address,
                    100
                ]
        )) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();

        fxBaseRootMock = await (
                (await ethers.getContractFactory(
                        "FxBaseRootMock"
                )) as FxBaseRootMock__factory
        ).deploy();
        await fxBaseRootMock.deployed();

        stMATIC = (await upgrades.deployProxy(
                await ethers.getContractFactory("StMATIC"),
                [
                    nodeOperatorRegistry.address,
                    mockERC20.address,
                    deployer.address,
                    insurance.address,
                    mockStakeManager.address,
                    poLidoNFT.address,
                    ethers.constants.AddressZero,
                    ethers.utils.parseEther("1000000000000000")
                ]
        )) as StMATIC;
        await stMATIC.deployed();

        await stMATIC.setFxStateRootTunnel(fxBaseRootMock.address);
        await poLidoNFT.setStMATIC(stMATIC.address);
        await nodeOperatorRegistry.setStMaticAddress(stMATIC.address);
    });

    it("Should submit successfully", async () => {
        const amount = ethers.utils.parseEther("1");
        await mint(testers[0], amount);
        await submit(testers[0], amount);

        const testerBalance = await stMATIC.balanceOf(testers[0].address);
        expect(testerBalance.eq(amount)).to.be.true;
    });

    it("Should revert if submit threshold is reached", async () => {
        const sumbitThreshold = ethers.utils.parseEther("1");
        await stMATIC.setSubmitThreshold(sumbitThreshold);
        await mint(testers[0], sumbitThreshold.add(1));
        await submit(testers[0], sumbitThreshold);

        await expect(submit(testers[0], 1)).to.be.revertedWith(
                "Submit threshold reached"
        );
    });

    it("Should successfuly disable the submit threshold handler", async () => {
        const sumbitThreshold = ethers.utils.parseEther("1");
        await stMATIC.setSubmitThreshold(sumbitThreshold);
        await mint(testers[0], sumbitThreshold.add(1));
        await stMATIC.flipSubmitHandler();
        await submit(testers[0], sumbitThreshold);
        await submit(testers[0], 1);

        const testerBalance = await stMATIC.balanceOf(testers[0].address);
        expect(testerBalance.eq(sumbitThreshold.add(1))).to.be.true;
    });

    it("Should successfuly increase the threshold limit", async () => {
        const sumbitThreshold = ethers.utils.parseEther("1");
        await stMATIC.setSubmitThreshold(sumbitThreshold);
        await mint(testers[0], sumbitThreshold.add(1));
        await stMATIC.flipSubmitHandler();
        await submit(testers[0], sumbitThreshold);
        await stMATIC.setSubmitThreshold(sumbitThreshold.add(1));
        await submit(testers[0], 1);

        const testerBalance = await stMATIC.balanceOf(testers[0].address);
        expect(testerBalance.eq(sumbitThreshold.add(1))).to.be.true;
    });

    it("Should request withdraw from the contract successfully", async () => {
        const amount = ethers.utils.parseEther("1");
        await mint(testers[0], amount);
        await submit(testers[0], amount);
        await requestWithdraw(testers[0], amount);
        const owned = await poLidoNFT.getOwnedTokens(testers[0].address);
        //expect(owned).length(1);
    });

    it("Should request withdraw from the contract when there is a staked operator but delegation didnt happen yet", async () => {
        const amount = ethers.utils.parseEther("100");
        const amount2Submit = ethers.utils.parseEther("0.05");
        await mint(testers[0], amount);

        await stakeOperator(user1);
        const validatorId = await mockStakeManager.getValidatorId(user1.address)

        await addOperator(validatorId.toString(), user1.address);
        await mint(testers[0], amount2Submit);
        await submit(testers[0], amount2Submit);
        await requestWithdraw(testers[0], ethers.utils.parseEther("0.005"));

        const balance = await poLidoNFT.balanceOf(testers[0].address);
        //expect(balance.eq(1)).to.be.true;
    });

    it("Should withdraw from EJECTED operators", async function () {
        const amount = ethers.utils.parseEther("100");
        const amount2Submit = ethers.utils.parseEther("0.05");
        await mint(testers[0], amount);

        await stakeOperator(user1);
        const validatorId = await mockStakeManager.getValidatorId(user1.address)

        await addOperator(validatorId.toString(), user1.address);

        await mint(testers[0], amount2Submit);
        await submit(testers[0], amount2Submit);

        await mockStakeManager.unstake(validatorId);
        await requestWithdraw(testers[0], ethers.utils.parseEther("0.005"));

        const balance = await poLidoNFT.balanceOf(testers[0].address);
        //expect(balance.eq(1)).to.be.true;
    });

    it("Should withdraw from JAILED operators", async function () {
        const amount = ethers.utils.parseEther("200");
        const amount2Submit = ethers.utils.parseEther("150");
        await mint(testers[0], amount);
        await stakeOperator(user1);
        const validatorId = await mockStakeManager.getValidatorId(user1.address)

        await addOperator(validatorId.toString(), user1.address);
        await mint(testers[0], amount2Submit);
        await submit(testers[0], amount2Submit);

        await mockStakeManager.slash(1);
        await requestWithdraw(testers[0], ethers.utils.parseEther("0.005"));
        const balance = await poLidoNFT.balanceOf(testers[0].address);
        //expect(balance.eq(1)).to.be.true;

        const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
        ).validatorShare;

        const validatorShareBalance = await mockERC20.balanceOf(
                validatorShareAddress
        );

        //expect(validatorShareBalance.eq(0)).to.be.true;
    });

    it("Should claim tokens after submitting to contract successfully", async () => {
        const ownedTokens: BigNumber[][] = [];
        const submitAmounts: string[] = [];
        const withdrawAmounts: string[] = [];

        const [minAmount, maxAmount] = [0.005, 0.01];
        const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

        for (let i = 0; i < delegatorsAmount; i++) {
            submitAmounts.push(
                    (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
            );
            const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

            await mint(testers[i], submitAmountWei);
            await submit(testers[i], submitAmountWei);
        }

        await mockStakeManager.setEpoch(1);

        for (let i = 0; i < delegatorsAmount; i++) {
            withdrawAmounts.push(
                    (
                            Math.random() * (Number(submitAmounts[i]) - minAmount) +
                            minAmount
                    ).toFixed(3)
            );
            const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);

            await requestWithdraw(testers[i], withdrawAmountWei);
            ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
        }

        const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        const currentEpoch = await mockStakeManager.epoch();

        await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

        for (let i = 0; i < delegatorsAmount; i++) {
            //await claimTokens(testers[i], ownedTokens[i][0]);
            const balanceAfter = await mockERC20.balanceOf(testers[i].address);

            // expect(balanceAfter.eq(ethers.utils.parseEther(withdrawAmounts[i]))).to.be
            //         .true;
        }
    });

    it("Should claim tokens after delegating to validator successfully", async () => {
        const submitAmount = ethers.utils.parseEther("0.01");
        const withdrawAmount = ethers.utils.parseEther("0.005");

        await mint(testers[0], ethers.utils.parseEther("100"));
        await stakeOperator(user1);
        const validatorId = await mockStakeManager.getValidatorId(user1.address)

        await addOperator(validatorId.toString(), user1.address);
        await mint(testers[0], submitAmount);
        await submit(testers[0], submitAmount);
        await stMATIC.delegate();
        const balanceBefore = await mockERC20.balanceOf(testers[0].address);
        await requestWithdraw(testers[0], withdrawAmount);

        const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        const currentEpoch = await mockStakeManager.epoch();
        await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

        //const owned = await poLidoNFT.getOwnedTokens(testers[0].address);
        ///await claimTokens(testers[0], owned[0]);
        //const balanceAfter = await mockERC20.balanceOf(testers[0].address);

        //expect(balanceAfter.sub(balanceBefore).eq(withdrawAmount)).to.be.true;
    });

    it("Should delegate to validator if stake manager has approval > 0", async () => {
        let initialSubmitAmount = ethers.utils.parseEther("99");
        for (let i = 0; i < 2; i++) {
            await mint(testers[i], ethers.utils.parseEther("100"));

            await stakeOperator(testers[i]);
            const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

            await addOperator(validatorId.toString(), testers[i].address);
        }
        const balanceBefore = await stMATIC.balanceOf(testers[0].address);

        await mint(testers[0], initialSubmitAmount);
        await submit(testers[0], initialSubmitAmount);
        await stMATIC.delegate();

        const finalSubmitAmount = ethers.utils.parseEther("100");
        await mint(testers[0], finalSubmitAmount);
        await submit(testers[0], finalSubmitAmount);
        await stMATIC.delegate();

        const balanceAfter = await stMATIC.balanceOf(testers[0].address);
        //expect(balanceAfter.sub(balanceBefore).eq(initialSubmitAmount.add(finalSubmitAmount))).to.be.true;
    });

    it("StMATIC stake should stay the same if an attacker sends matic to the validator", async () => {
        const submitAmount = ethers.utils.parseEther("0.01");

        await mint(testers[0], ethers.utils.parseEther("100"));
        await stakeOperator(testers[0]);
        const validatorId = await mockStakeManager.getValidatorId(testers[0].address)

        await addOperator(validatorId.toString(), testers[0].address);
        await mint(testers[0], submitAmount);
        await submit(testers[0], submitAmount);
        await stMATIC.delegate();

        const balanceBefore = await stMATIC.getTotalStakeAcrossAllValidators();
        const operator = await nodeOperatorRegistry["getNodeOperator(uint256)"](1);

        const selfDestructor = (await (
                await ethers.getContractFactory("SelfDestructor")
        ).deploy()) as SelfDestructor;

        await testers[0].sendTransaction({
            to: selfDestructor.address,
            value: ethers.utils.parseEther("1.0")
        });

        await selfDestructor.selfdestruct(operator.validatorShare);

        const balanceAfter = await stMATIC.getTotalStakeAcrossAllValidators();

        expect(balanceAfter.eq(balanceBefore)).to.be.true;
    });

    it("Should update minValidatorBalance correctly", async () => {
        const submitAmount = ethers.utils.parseEther("0.01");

        await mint(testers[0], ethers.utils.parseEther("100"));
        await stakeOperator(testers[0]);
        const validatorId = await mockStakeManager.getValidatorId(testers[0].address)

        await addOperator(validatorId.toString(), testers[0].address);

        await mint(testers[0], submitAmount);
        await submit(testers[0], submitAmount);
        await stMATIC.delegate();

        const minValidatorBalanceBefore = await stMATIC.getMinValidatorBalance();

        await mint(testers[0], submitAmount.mul(2));
        await submit(testers[0], submitAmount);
        await stMATIC.delegate();

        const minValidatorBalanceAfter = await stMATIC.getMinValidatorBalance();

        //expect(!minValidatorBalanceBefore.eq(minValidatorBalanceAfter)).to.be.true;
    });

    it("Should return the correct conversion amount for Matic and StMatic", async () => {
        for (let i = 0; i < 3; i++) {
            await mint(testers[i], ethers.utils.parseEther("100"));
            await stakeOperator(testers[i]);
            const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
            await addOperator(validatorId.toString(), testers[i].address);
        }

        const user1SubmitAmount = toEth("100");
        await mint(user1, user1SubmitAmount);
        await submit(user1, user1SubmitAmount);

        let user2SubmitAmount = toEth("100");
        await mint(user2, user2SubmitAmount);
        await submit(user2, user2SubmitAmount);

        await stMATIC.delegate();

        const stMaticToMatic = await stMATIC.convertStMaticToMatic(100);
        expect(stMaticToMatic.amountInMatic).to.equal(100);
        expect(stMaticToMatic.totalStMaticAmount).to.equal(toEth("200"));
        expect(stMaticToMatic.totalPooledMatic).to.equal(toEth("200"));


        const maticToStMatic = await stMATIC.convertMaticToStMatic(100);
        expect(maticToStMatic.amountInStMatic).to.equal(100);
        expect(maticToStMatic.totalPooledMatic).to.equal(toEth("200"));
        expect(maticToStMatic.totalStMaticAmount).to.equal(toEth("200"));
    });

    //1 validator, n delegators test
    it("Should delegate and claim tokens from n delegators to 1 validator", async () => {
        // const ownedTokens: BigNumber[][] = [];
        // const submitAmounts: string[] = [];
        // const withdrawAmounts: BigNumber[] = [];
        //
        // const [minAmount, maxAmount] = [0.005, 0.01];
        // const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // await mint(testers[0], ethers.utils.parseEther("100"));
        //
        // await stakeOperator(testers[0]);
        // const validatorId = await mockStakeManager.getValidatorId(testers[0].address)
        //
        // await addOperator(validatorId.toString(), testers[0].address);
        //
        // for (let i = 0; i < delegatorsAmount; i++) {
        //     submitAmounts.push(
        //       ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
        //     );
        //     const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
        //
        //     await mint(testers[i], submitAmountWei);
        //     await submit(testers[i], submitAmountWei);
        // }
        //
        // await stMATIC.delegate();
        // console.log("minvalbal",  await stMATIC.getMinValidatorBalance());
        // console.log("tpm: ", await stMATIC.getTotalPooledMatic());
        //
        // const maxWithdrawPerDelegator = (await stMATIC.getTotalPooledMatic())
        //     .sub(await stMATIC.getMinValidatorBalance())
        //     .div(delegatorsAmount);
        //
        // for (let i = 0; i < delegatorsAmount; i++) {
        //     const randomWithdraw = ethers.BigNumber.from(
        //         ethers.utils.randomBytes(32)
        //     ).mod(maxWithdrawPerDelegator);
        //     const withdrawAmount = randomWithdraw.lt(
        //         ethers.utils.parseEther(submitAmounts[i])
        //     ) ? randomWithdraw : ethers.utils.parseEther(submitAmounts[i]);
        //
        //     withdrawAmounts.push(withdrawAmount);
        //     const withdrawAmountWei = withdrawAmounts[i];
        //     await requestWithdraw(testers[i], withdrawAmountWei);
        //     ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
        // }
        //
        // const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        // const currentEpoch = await mockStakeManager.epoch();
        // await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
        //
        // for (let i = 0; i < delegatorsAmount; i++) {
        //     await claimTokens(testers[i], ownedTokens[i][0]);
        //     const balanceAfter = await mockERC20.balanceOf(testers[i].address);
        //     console.log(balanceAfter, withdrawAmounts[i]);
        //
        //     expect(balanceAfter.eq(withdrawAmounts[i])).to.be.true;
        // }
    });

    // n validator, n delegator test
    it("Should delegate and claim from n delegators to m validators successfully", async () => {
        // const ownedTokens: BigNumber[][] = [];
        // const submitAmounts: string[] = [];
        // const withdrawAmounts: string[] = [];
        //
        // const [minAmount, maxAmount] = [0.001, 0.1];
        // const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // for (let i = 0; i < delegatorsAmount; i++) {
        //   await mint(testers[i], ethers.utils.parseEther("100"));
        //   await stakeOperator(testers[i]);
        //   const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
        //
        //   await addOperator(validatorId.toString(), testers[i].address);
        // }
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     submitAmounts.push(
        //         (
        //             (Math.random() * (maxAmount - minAmount) + minAmount) *
        //   delegatorsAmount
        //         ).toFixed(3)
        //     );
        //     const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
        //
        //     await mint(testers[i], submitAmountWei);
        //     await submit(testers[i], submitAmountWei);
        // }
        //
        // await stMATIC.delegate();
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     withdrawAmounts.push(
        //         (
        //             Math.random() * (Number(submitAmounts[i]) - minAmount) +
        //   minAmount
        //         ).toFixed(3)
        //     );
        //     const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
        //     await requestWithdraw(testers[i], withdrawAmountWei);
        //     ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
        // }
        //
        // const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        // const currentEpoch = await mockStakeManager.epoch();
        // await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     for (let j = 0; j < ownedTokens[i].length; j++) {
        //         await claimTokens(testers[i], ownedTokens[i][j]);
        //     }
        //     const balanceAfter = await mockERC20.balanceOf(testers[i].address);
        //
        //     // expect(balanceAfter.eq(ethers.utils.parseEther(withdrawAmounts[i]))).to.be
        //     //     .true;
        // }
    });

    it("Shouldn't delegate to validator if delegation flag is false", async () => {
        // const submitAmounts: string[] = [];
        //
        // const [minAmount, maxAmount] = [0.001, 0.1];
        // const delegatorsAmount = 2;
        // const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // for (let i = 0; i < delegatorsAmount; i++) {
        //   await mint(testers[i], ethers.utils.parseEther("100"));
        //   await stakeOperator(testers[i]);
        //   const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
        //   await addOperator(validatorId.toString(), testers[i].address);
        // }
        //
        // const validatorShareAddress = (
        //     await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
        // ).validatorShare;
        //
        // const ValidatorShareMock = await ethers.getContractFactory(
        //     "ValidatorShareMock"
        // );
        // const validatorShare = ValidatorShareMock.attach(
        //     validatorShareAddress
        // ) as ValidatorShareMock;
        //
        // await validatorShare.updateDelegation(false);
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     submitAmounts.push(
        //             ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
        //     );
        //     const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
        //
        //     await mint(testers[i], submitAmountWei);
        //     await submit(testers[i], submitAmountWei);
        // }
        //
        // await stMATIC.delegate();
        // const validatorShareBalance = await mockERC20.balanceOf(
        //     validatorShareAddress
        // );
        //
        // expect(validatorShareBalance.eq(0)).to.be.true;
    });

    it("Shouldn't delegate to a delegator that has disabled delegation", async () => {
        // const validatorsAmount = 2;
        // const testersAmount = 2;
        // const submitAmount = ethers.utils.parseEther("1");
        //
        // for (let i = 0; i < validatorsAmount; i++) {
        //   await mint(testers[i], ethers.utils.parseEther("100"));
        //   await stakeOperator(testers[i]);
        //   const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
        //   await addOperator(validatorId.toString(), testers[i].address);
        // }
        //
        // const validatorShareAddress = (
        //     await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
        // ).validatorShare;
        // const ValidatorShareMock = await ethers.getContractFactory(
        //     "ValidatorShareMock"
        // );
        // const validatorShare = ValidatorShareMock.attach(
        //     validatorShareAddress
        // ) as ValidatorShareMock;
        //
        // await validatorShare.updateDelegation(false);
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     await mint(testers[i], submitAmount);
        //     await submit(testers[i], submitAmount);
        // }
        //
        // await stMATIC.delegate();
        //
        // const validatorShareBalance = await mockERC20.balanceOf(
        //     validatorShareAddress
        // );
        //
        // //expect(validatorShareBalance.eq(0)).to.be.true;
        //
        // const delegatedAmount = await stMATIC.getTotalStakeAcrossAllValidators();
        // expect(delegatedAmount.eq(submitAmount.mul(testersAmount))).to.be.true;
    });


    it("Should delegate from multiple users to a validator", async () => {
        for (let i = 0; i < 3; i++) {
            await mint(testers[i], ethers.utils.parseEther("100"));
            await stakeOperator(testers[i]);
            const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
            await addOperator(validatorId.toString(), testers[i].address);
        }

        const user1SubmitAmount = toEth("100");
        await mint(user1, user1SubmitAmount);
        await submit(user1, user1SubmitAmount);

        let user2SubmitAmount = toEth("50");
        await mint(user2, user2SubmitAmount);
        await submit(user2, user2SubmitAmount);

        //CASE 1: Should delegate to all validators equally
        expect(await stMATIC.delegate())
                .emit(stMATIC, "DelegateEvent")
                .withArgs(toEth("150"), 0);
        for (let i = 0; i < 3; i++) {
            const validatorShare = await getValidatorShare(i + 1);
            expect(await validatorShare.totalStaked()).to.eq(toEth("50"));
        }

        //CASE 2: Check that total buffered is set to 0 after delegation
        expect(await stMATIC.totalBuffered()).to.equal(0);

        await mint(testers[3], toEth("100"));
        await stakeOperator(testers[3]);
        const validatorId = await mockStakeManager.getValidatorId(testers[3].address)
        await addOperator(validatorId.toString(), testers[3].address);

        user2SubmitAmount = toEth("10");
        await mint(user2, user2SubmitAmount);
        await submit(user2, user2SubmitAmount);

        //CASE 3: Fail to delegate when total buffered is less than minimum amount to delegate
        await stMATIC.setDelegationLowerBound(toEth("50"));
        await expect(stMATIC.delegate()).to.be.revertedWith("Amount to delegate lower than minimum");

        //CASE 4: Successfully delegate if total buffered is greater than delegation lower bound.
        await stMATIC.setDelegationLowerBound(toEth("1"));
        expect(await stMATIC.delegate())
                .emit(stMATIC, "DelegateEvent")
                .withArgs(toEth("10"), 0);
        for (let i = 0; i < 3; i++) {
            const validatorShare = await getValidatorShare(i + 1);
            expect(await validatorShare.totalStaked()).to.eq(toEth("50"));
        }

        const validatorShare = await getValidatorShare(4);
        expect(await validatorShare.totalStaked()).to.eq(toEth("10"));
    });


    it("Should rebalance delegated tokens to validators", async () => {
        for (let i = 0; i < 3; i++) {
            await mint(testers[i], ethers.utils.parseEther("100"));
            await stakeOperator(testers[i]);
            const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
            await addOperator(validatorId.toString(), testers[i].address);
        }

        const user1SubmitAmount = toEth("100");
        await mint(user1, user1SubmitAmount);
        await submit(user1, user1SubmitAmount);

        let user2SubmitAmount = toEth("50");
        await mint(user2, user2SubmitAmount);
        await submit(user2, user2SubmitAmount);

        await stMATIC.delegate();

        await mint(testers[3], toEth("100"));
        await stakeOperator(testers[3]);
        const validatorId = await mockStakeManager.getValidatorId(testers[3].address)
        await addOperator(validatorId.toString(), testers[3].address);

        await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(100);

        const maxWithdrawPercentagePerRebalance = 50
        await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(maxWithdrawPercentagePerRebalance);
        await stMATIC.rebalanceDelegatedTokens();

        const pendingWithdrawalsId = await poLidoNFT.getOwnedTokens(stMATIC.address);
        expect(pendingWithdrawalsId.length).to.equal(3);

        //CASE 1: Expect sum of amount2WithdrawFromStMATIC to equal totalToWithdraw
        let totalWithdrawRequestAmount = toEth("0");
        let totalToWithdraw = toEth("18.75");
        for(let i = 0; i < pendingWithdrawalsId.length; i++){
            const withdrawalRequest = await stMATIC.token2WithdrawRequest(pendingWithdrawalsId[i]);
            totalWithdrawRequestAmount = totalWithdrawRequestAmount
                    .add(withdrawalRequest.amount2WithdrawFromStMATIC);
        }

        expect(totalWithdrawRequestAmount).to.equal(totalToWithdraw);
    });


    it("Requesting withdraw AFTER slashing should result in lower balance", async () => {
        // const ownedTokens: BigNumber[][] = [];
        // const submitAmounts: string[] = [];
        // const withdrawAmounts: string[] = [];
        //
        // const [minAmount, maxAmount] = [0.001, 0.1];
        // const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // for (let i = 0; i < delegatorsAmount; i++) {
        //   await mint(testers[i], ethers.utils.parseEther("100"));
        //
        //   await stakeOperator(testers[i]);
        //   const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
        //
        //   await addOperator(validatorId.toString(), testers[i].address);
        // }
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     submitAmounts.push(
        //         (
        //             (Math.random() * (maxAmount - minAmount) + minAmount) *
        //   delegatorsAmount
        //         ).toFixed(3)
        //     );
        //     const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
        //
        //     await mint(testers[i], submitAmountWei);
        //     await submit(testers[i], submitAmountWei);
        // }
        //
        // await stMATIC.delegate();
        //
        // for (let i = 0; i < delegatorsAmount; i++) {
        //     await slash(i + 1, 10);
        // }
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     withdrawAmounts.push(
        //         (
        //             Math.random() * (Number(submitAmounts[i]) - minAmount) +
        //   minAmount
        //         ).toFixed(3)
        //     );
        //     const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
        //     await requestWithdraw(testers[i], withdrawAmountWei);
        //     ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
        // }
        //
        // const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        // const currentEpoch = await mockStakeManager.epoch();
        // await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     for (let j = 0; j < ownedTokens[i].length; j++) {
        //         await claimTokens(testers[i], ownedTokens[i][j]);
        //     }
        //     const balanceAfter = await mockERC20.balanceOf(testers[i].address);
        //
        //     //expect(balanceAfter.lt(ethers.utils.parseEther(withdrawAmounts[i]))).to.be.true;
        // }
    });

    it("Requesting withdraw BEFORE slashing should result in a lower balance withdrawal", async () => {
        // const ownedTokens: BigNumber[][] = [];
        // const submitAmounts: string[] = [];
        // const withdrawAmounts: string[] = [];
        //
        // const [minAmount, maxAmount] = [0.001, 0.1];
        // const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
        // for (let i = 0; i < delegatorsAmount; i++) {
        //   await mint(testers[i], ethers.utils.parseEther("100"));
        //   await stakeOperator(testers[i]);
        //   const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
        //
        //   await addOperator(validatorId.toString(), testers[i].address);
        // }
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     submitAmounts.push(
        //         (
        //             (Math.random() * (maxAmount - minAmount) + minAmount) *
        //   delegatorsAmount
        //         ).toFixed(3)
        //     );
        //     const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
        //
        //     await mint(testers[i], submitAmountWei);
        //     await submit(testers[i], submitAmountWei);
        // }
        //
        // await stMATIC.delegate();
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     withdrawAmounts.push(
        //         (
        //             Math.random() * (Number(submitAmounts[i]) - minAmount) +
        //   minAmount
        //         ).toFixed(3)
        //     );
        //     const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
        //     await requestWithdraw(testers[i], withdrawAmountWei);
        //     ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
        // }
        //
        // for (let i = 0; i < delegatorsAmount; i++) {
        //     await slash(i + 1, 10);
        // }
        //
        // const withdrawalDelay = await mockStakeManager.withdrawalDelay();
        // const currentEpoch = await mockStakeManager.epoch();
        // await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
        //
        // for (let i = 0; i < testersAmount; i++) {
        //     for (let j = 0; j < ownedTokens[i].length; j++) {
        //         await claimTokens(testers[i], ownedTokens[i][j]);
        //     }
        //     const balanceAfter = await mockERC20.balanceOf(testers[i].address);
        //
        //     // expect(balanceAfter.lte(ethers.utils.parseEther(withdrawAmounts[i]))).to
        //     //     .be.true;
        // }
    });

    it("Should pause the contract successfully", async () => {
        await stMATIC.togglePause();
        await expect(stMATIC.delegate()).to.be.revertedWith("Pausable: paused");
    });

    it("Update dao address", async () => {
        const newDAOAdress = testers[5].address;

        const daoRole = await stMATIC.DAO();
        expect(await stMATIC.hasRole(daoRole, deployer.address), "Before").true;
        expect(await stMATIC.hasRole(daoRole, newDAOAdress), "Before").false;

        await stMATIC.setDaoAddress(newDAOAdress);
        expect(await stMATIC.hasRole(daoRole, deployer.address), "After").false;
        expect(await stMATIC.hasRole(daoRole, newDAOAdress), "After").true;
    });

    describe("Distribute rewards", async () => {
        describe("Success cases", async () => {
            const numOperators = 3;
            beforeEach("setup", async () => {
                for (let i = 1; i <= numOperators; i++) {
                    await mint(testers[i], ethers.utils.parseEther("100"));
                    await stakeOperator(testers[i]);
                    const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                    await addOperator(validatorId.toString(), testers[i].address);
                }
                await stMATIC.setDelegationLowerBound(5);
            });

            class TestCase {
                message: string;
                rewardPerValidator: number;
                insuraceRewards: string;
                daoRewards: string;
                delegate: boolean;
                amountSubmittedPerUser: number;
                expectedTotalBuffred: number;

                constructor(
                        message: string,
                        rewardPerValidator: number,
                        insuraceRewards: string,
                        daoRewards: string,
                        delegate: boolean,
                        amountSubmittedPerUser: number,
                        expectedTotalBuffred: number
                ) {
                    this.message = message;
                    this.rewardPerValidator = rewardPerValidator;
                    this.insuraceRewards = insuraceRewards;
                    this.daoRewards = daoRewards;
                    this.delegate = delegate;
                    this.amountSubmittedPerUser = amountSubmittedPerUser;
                    this.expectedTotalBuffred = expectedTotalBuffred;
                }
            }

            const testCases: Array<TestCase> = [{
                message: "distribute rewards: totalBuffred == 0",
                rewardPerValidator: 100,
                insuraceRewards: "7500000000000000000",
                daoRewards: "7500000000000000000",
                delegate: true,
                amountSubmittedPerUser: 10,
                expectedTotalBuffred: 270
            }, {
                message: "distribute rewards: totalBuffred != 0",
                rewardPerValidator: 100,
                insuraceRewards: "7500000000000000000",
                daoRewards: "7500000000000000000",
                delegate: false,
                amountSubmittedPerUser: 10,
                expectedTotalBuffred: 300 // (270 of 90% of rewards + 30 submitted by users)
            }];

            for (let index = 0; index < testCases.length; index++) {
                const {
                    message,
                    rewardPerValidator,
                    insuraceRewards,
                    daoRewards,
                    delegate,
                    amountSubmittedPerUser,
                    expectedTotalBuffred
                } = testCases[index];

                it(index + " " + message, async () => {
                    for (let i = 1; i <= numOperators; i++) {
                        await mint(
                                testers[i],
                                ethers.utils.parseEther(amountSubmittedPerUser.toString())
                        );
                        await submit(
                                testers[i],
                                ethers.utils.parseEther(amountSubmittedPerUser.toString())
                        );

                        // transfer some tokens to the validatorShare contracts to mimic rewards.
                        await mint(
                                deployer,
                                ethers.utils.parseEther(String(rewardPerValidator))
                        );
                        await mockERC20.transfer(
                                await getValidatorShareAddress(i),
                                ethers.utils.parseEther(String(rewardPerValidator))
                        );
                    }
                    if (delegate) {
                        // delegate and check the totalBuffred
                        await stMATIC.delegate();
                        //expect(await stMATIC.totalBuffered(), "totalBuffered").eq(0);
                    } else {
                        // check the totalBuffred
                        // expect(await stMATIC.totalBuffered(), "totalBuffered").eq(
                        //     ethers.utils.parseEther(
                        //         String(amountSubmittedPerUser * numOperators)
                        //     )
                        // );
                    }

                    // calculate rewards
                    const totalRewards = rewardPerValidator * numOperators;
                    const rewards = (totalRewards * 10) / 100;
                    const DAOBalanceBeforeDistribute = await mockERC20.balanceOf(
                            deployer.address
                    );

                    // distribute rewards
                    // expect(await stMATIC.distributeRewards())
                    //     .emit(stMATIC, "DistributeRewardsEvent")
                    //     .withArgs(ethers.utils.parseEther(String(rewards)));
                    //
                    // // check totalBuffred with expectedTotalBuffred
                    // expect(await stMATIC.totalBuffered(), "after totalBuffered").eq(
                    //     ethers.utils.parseEther(String(expectedTotalBuffred))
                    // );
                    //
                    // // check if insurance and DAO received the correct amount
                    // expect(await mockERC20.balanceOf(insurance.address)).eq(
                    //     insuraceRewards
                    // );
                    // expect(
                    //     (await mockERC20.balanceOf(deployer.address)).sub(
                    //         DAOBalanceBeforeDistribute
                    //     )
                    // ).eq(daoRewards);

                    const rewardsPerValidator = ethers.utils.parseEther("5");
                    // check operators rewards
                    for (let ii = 0; ii < numOperators; ii++) {
                        const op = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, ii + 1);
                        // expect(
                        //     await mockERC20.balanceOf(op.rewardAddress)
                        // ).eq(rewardsPerValidator);
                    }
                });
            }
        });

        it("should not revert if a validator does not accumulate enough rewards", async () => {
            const numOperators = 2;
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }
            await stMATIC.setDelegationLowerBound(5);

            await stMATIC.setRewardDistributionLowerBound(
                    ethers.utils.parseEther("100")
            );

            const validatorShareRewards = [1000, 10];
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("10"));
                await submit(testers[i], ethers.utils.parseEther(String(10)));

                // transfer some tokens to the validatorShare contracts to mimic rewards.
                const rewardAmount = validatorShareRewards[i - 1];
                await mint(deployer, ethers.utils.parseEther(rewardAmount.toString()));
                await mockERC20.transfer(
                        await getValidatorShareAddress(i),
                        ethers.utils.parseEther(rewardAmount.toString())
                );
            }

            const totalRewards = 1010;
            const rewards = (totalRewards * 10) / 100;

            // expect(await stMATIC.distributeRewards())
            //     .emit(stMATIC, "DistributeRewardsEvent")
            //     .withArgs(ethers.utils.parseEther(String(rewards)));

            const rewardPerValidator = ethers.utils.parseEther("25.25");
            const operator1 = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, 1);
            // expect(
            //     await mockERC20.balanceOf(operator1.rewardAddress)
            // ).eq(rewardPerValidator);

            const operator2 = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, 2);
            // expect(
            //     await mockERC20.balanceOf(operator2.rewardAddress)
            // ).eq(rewardPerValidator);
        })
    });

    describe("Fail cases", async () => {
        it("Amount to distribute lower than minimum", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
                ;
            }
            await stMATIC.setDelegationLowerBound(5);

            await stMATIC.setRewardDistributionLowerBound(
                    ethers.utils.parseEther("100")
            );

            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("10"));
                await submit(testers[i], ethers.utils.parseEther(String(10)));

                // transfer some tokens to the validatorShare contracts to mimic rewards.
                await mint(deployer, ethers.utils.parseEther("1"));
                await mockERC20.transfer(
                        await getValidatorShareAddress(i),
                        ethers.utils.parseEther(String(1))
                );

                // await expect(stMATIC.distributeRewards()).revertedWith(
                //     "Amount to distribute lower than minimum"
                // );
            }
        });
    });

    describe("withdrawTotalDelegated", async () => {
        describe("Success cases", async () => {
            // stake operators
            const operatorId = 3;
            beforeEach("setup", async () => {
                for (let i = 1; i <= operatorId; i++) {
                    await mint(testers[i], ethers.utils.parseEther("100"));
                    await stakeOperator(testers[i]);
                    const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                    await addOperator(validatorId.toString(), testers[i].address);
                    await stMATIC.setDelegationLowerBound(1);
                }
            });

            class TestCase {
                message: string;
                delegate: boolean;
                tokenIds: Array<number>;

                constructor(
                        message: string,
                        delegate: boolean,
                        tokenIds: Array<number>
                ) {
                    this.message = message;
                    this.delegate = delegate;
                    this.tokenIds = tokenIds;
                }
            }

            const testCases: Array<TestCase> = [
                {
                    message: "Withdraw when delegated amount != 0",
                    delegate: true,
                    tokenIds: [1, 2, 3]
                },
                {
                    message: "Withdraw when delegated amount == 0",
                    delegate: false,
                    tokenIds: []
                }
            ];

            for (let index = 0; index < testCases.length; index++) {
                const {message, delegate, tokenIds} = testCases[index];

                it(index + " " + message, async () => {
                    // if delegate is true users submit.
                    if (delegate) {
                        for (let i = 1; i <= 3; i++) {
                            await mint(testers[i], ethers.utils.parseEther("10"));

                            await submit(testers[i], ethers.utils.parseEther("10"));
                        }
                        await stMATIC.delegate();
                    }

                    // set stakeManager epoch
                    const epoch = 20;
                    await mockStakeManager.setEpoch(epoch);

                    // set stop operators
                    //await stopOperator(1);
                    //await stopOperator(2);
                    //await stopOperator(3);

                    for (let i = 0; i < tokenIds.length; i++) {
                        // check if the stMATIC has a token
                        //const nftTokenId = await poLidoNFT.owner2Tokens(stMATIC.address, i);
                        //expect(nftTokenId, i + "-tokenId").eq(tokenIds[i]);

                        // check if the withdrawRequest has correct data
                        // const withdrawRequest = await stMATIC.token2WithdrawRequest(
                        //     nftTokenId
                        // );
                        // expect(withdrawRequest.validatorNonce).not.eq(0);
                        // expect(withdrawRequest.requestEpoch).not.eq(epoch);
                        // expect(withdrawRequest.validatorAddress).eq(
                        //     await getValidatorShareAddress(i + 1)
                        // );
                    }
                });
            }
        });
        describe("Fail cases", async () => {
            it("Fail to withdrawTotalDelegated caller not node operator", async () => {
                //     await expect(
                //         stMATIC.withdrawTotalDelegated(ethers.constants.AddressZero)
                //     ).revertedWith("Not a node operator");
            });
        });
    });

    describe("claimTokens2StMatic", async () => {
        describe("Success cases", async () => {
            // stake node operator
            const numOperators = 1;
            beforeEach("Success cases", async () => {
                for (let i = 1; i <= numOperators; i++) {
                    await mint(testers[i], ethers.utils.parseEther("100"));
                    await stakeOperator(testers[i]);
                    const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                    await addOperator(validatorId.toString(), testers[i].address);
                }
            });

            class TestCase {
                message: string;
                fn: Function;

                constructor(message: string, fn: Function) {
                    this.message = message;
                    this.fn = fn;
                }
            }

            const testCases: Array<TestCase> = [
                {
                    message: "stop operator",
                    fn: async function () {
                        const no = await nodeOperatorRegistry[
                                "getNodeOperator(uint256)"
                                ].call(this, 1);
                        //await stopOperator(1);
                        //await erc721Contract.mint(no.validatorProxy, 1);
                    }
                },
                {
                    message: "unstake operator",
                    fn: async function () {
                        //await nodeOperatorRegistry.connect(testers[1])["unstake()"].call(this);
                    }
                }
            ];

            for (let index = 0; index < testCases.length; index++) {
                const {message, fn} = testCases[index];

                it(index + "-" + message, async () => {
                    // set lower bound
                    await stMATIC.setDelegationLowerBound(5);

                    // users submit
                    const numOfUsers = 3;
                    for (let i = 1; i <= numOfUsers; i++) {
                        await mint(testers[i], ethers.utils.parseEther("100"));
                        await submit(testers[i], ethers.utils.parseEther("100"));
                    }

                    // delegate
                    await stMATIC.delegate();

                    // set epoch to 1
                    await mockStakeManager.setEpoch(1);

                    await fn();

                    // set epoch to 20
                    const withdrawalDelay = await mockStakeManager.withdrawalDelay();
                    const currentEpoch = await mockStakeManager.epoch();
                    await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

                    // transfer to validatorShare Eth to test with.
                    const claimesAmount = ethers.utils.parseEther("100");
                    //const token = await poLidoNFT.owner2Tokens(stMATIC.address, 0);
                    //const buffered = await stMATIC.totalBuffered();
                    //const req = await stMATIC.token2WithdrawRequest(token);
                    //await mint(deployer, claimesAmount);
                    //await mockERC20.transfer(req.validatorAddress, claimesAmount);

                    // claimTokens2StMatic
                    // expect(await stMATIC.claimTokens2StMatic(token))
                    //   .emit(stMATIC, "ClaimTokensEvent")
                    //   .withArgs(stMATIC.address, token, claimesAmount, 0);
                    //
                    // expect(await stMATIC.totalBuffered(), "totalBuffered").eq(
                    //   buffered.add(claimesAmount)
                    // );
                });
            }
        });
    });

    describe("Fail cases", async () => {
        it("Fail withdraw delay not reached", async () => {
            // stake operator
            const numOperators = 1;
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }

            await stMATIC.setDelegationLowerBound(1);

            // users submit
            const numOfUsers = 3;
            for (let i = 1; i <= numOfUsers; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await submit(testers[i], ethers.utils.parseEther("100"));
            }

            // delegate
            await stMATIC.delegate();
            await mockStakeManager.setEpoch(1);
            //await stopOperator(1);

            // claimTokens2StMatic before withdraw delay is reached.
            //const token = await poLidoNFT.owner2Tokens(stMATIC.address, 0);
            // await expect(stMATIC.claimTokens2StMatic(token)).revertedWith(
            //     "Not able to claim yet"
            // );
        });
    });

});


// convert a string to ether
// @ts-ignore
function toEth(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
}