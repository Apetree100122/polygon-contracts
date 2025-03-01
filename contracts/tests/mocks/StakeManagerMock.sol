// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../helpers/ERC721Test.sol";
import "../mocks/ValidatorShareMock.sol";
import "../../interfaces/IStakeManager.sol";

contract StakeManagerMock is IStakeManager {
    mapping(uint256 => IStakeManager.Validator) smValidators;
    struct State {
        address token;
        uint256 id;
        mapping(address => uint256) validators;
        mapping(uint256 => address) Owners;
        mapping(uint256 => uint256) stakedAmount;
        mapping(uint256 => address) signer;
        mapping(uint256 => address) validatorShares;
        mapping(address => uint256) delegator2Amount;
        uint256 epoch;
    }

    State private state;

    constructor(address _token) {
        state.token = _token;
    }

    function stakeFor(
        address _user,
        uint256 _amount,
        uint256,
        bool,
        bytes memory _signerPubkey
    ) external {
        uint256 id = state.id + 1;
        state.validators[_user] = id;
        state.Owners[id] = _user;

        address validatorShare =address(
            new ValidatorShareMock(state.token, address(this), id)
        );
        smValidators[id] = IStakeManager.Validator({
            amount: _amount,
            reward: 0,
            activationEpoch: block.timestamp,
            deactivationEpoch: 0,
            jailTime: 0,
            signer: address(uint160(uint256(keccak256(_signerPubkey)))),
            contractAddress: validatorShare,
            status: IStakeManager.Status.Active,
            commissionRate: 0,
            lastCommissionUpdate: 0,
            delegatorsReward: 0,
            delegatedAmount: 0,
            initialRewardPerStake: 0
        });
        state.id++;
        state.stakedAmount[id] = _amount;
        state.validatorShares[id] = validatorShare;
    }

    function restake(
        uint256,
        uint256 _amount,
        bool
    ) external {
        IERC20(state.token).transferFrom(msg.sender, address(this), _amount);
    }

    function unstake(uint256 _validatorId) external {
        smValidators[_validatorId].deactivationEpoch = block.timestamp;
    }

    function topUpForFee(address _user, uint256 _heimdallFee) external {}

    function getValidatorId(address _user) external view returns (uint256) {
        return state.validators[_user];
    }

    function getValidatorContract(uint256 _validatorId)
        external
        view
        override
        returns (address)
    {
        return smValidators[_validatorId].contractAddress;
        // return state.validatorShares[_validatorId];
    }

    function withdrawRewards(uint256) external {
        IERC20(state.token).transfer(msg.sender, 1000);
    }

    function unstakeClaim(uint256 _validatorId) external {
        IERC20(state.token).transfer(
            msg.sender,
            IERC20(state.token).balanceOf(address(this))
        );
        state.delegator2Amount[msg.sender] = 0;
        smValidators[_validatorId].status = IStakeManager.Status.Unstaked;
    }

    function validatorStake(uint256 _validatorId)
        external
        view
        returns (uint256)
    {
        return state.stakedAmount[_validatorId];
    }

    function updateSigner(uint256 _validatorId, bytes memory _signerPubkey)
        external
    {}

    function claimFee(
        uint256 _accumFeeAmount,
        uint256 _index,
        bytes memory _proof
    ) external {}

    function updateCommissionRate(
        uint256 _validatorId,
        uint256 _newCommissionRate
    ) external {
        smValidators[_validatorId].commissionRate = _newCommissionRate;
    }

    function unjail(uint256 _validatorId) external {
        require(
            smValidators[_validatorId].status == IStakeManager.Status.Locked,
            "validator not locked"
        );
        smValidators[_validatorId].status = IStakeManager.Status.Active;
    }

    function setValidatorStatus(uint256 _validatorId, IStakeManager.Status _status) external {
        smValidators[_validatorId].status = _status;
    }

    function withdrawalDelay() external override pure returns (uint256) {
        return (2**13);
    }

    function delegationDeposit(
        uint256,
        uint256 amount,
        address delegator
    ) external override returns (bool) {
        state.delegator2Amount[msg.sender] += amount;
        IERC20(state.token).transferFrom(delegator, address(this), amount);
        return IERC20(state.token).transfer(msg.sender, amount);
    }

    function epoch() external view override returns (uint256) {
        return state.epoch;
    }

    function slash(uint256 _validatorId) external {
        smValidators[_validatorId].status = IStakeManager.Status.Locked;
        state.stakedAmount[_validatorId] -= 100;
    }

    function validators(uint256 _validatorId)
        external
        view
        override
        returns (Validator memory)
    {
        return smValidators[_validatorId];
    }

    /// @notice Returns the validator accumulated rewards on stake manager.
    function validatorReward(uint256) external pure returns (uint256) {
        return 1000;
    }

    function setEpoch(uint256 _epoch) external {
        state.epoch = _epoch;
    }
}
