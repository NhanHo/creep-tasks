'use strict';

function deref(ref) {
    return Game.getObjectById(ref) || Game.flags[ref] || Game.creeps[ref] || Game.spawns[ref] || null;
}
function derefRoomPosition(protoPos) {
    return new RoomPosition(protoPos.x, protoPos.y, protoPos.roomName);
}
function isEnergyStructure(structure) {
    return structure.energy != undefined && structure.energyCapacity != undefined;
}
function isStoreStructure(structure) {
    return structure.store != undefined;
}

class Task {
    constructor(taskName, target, options = {}) {
        this.name = taskName;
        this._creep = {
            name: '',
        };
        if (target) {
            this._target = {
                ref: target.ref,
                _pos: target.pos,
            };
        }
        else {
            this._target = {
                ref: '',
                _pos: {
                    x: -1,
                    y: -1,
                    roomName: '',
                }
            };
        }
        this._parent = null;
        this.settings = {
            targetRange: 1,
            workOffRoad: false,
            oneShot: false,
        };
        _.defaults(options, {
            blind: false,
            moveOptions: {},
        });
        this.tick = Game.time;
        this.options = options;
        this.data = {
            quiet: true,
        };
    }
    get proto() {
        return {
            name: this.name,
            _creep: this._creep,
            _target: this._target,
            _parent: this._parent,
            options: this.options,
            data: this.data,
            tick: this.tick,
        };
    }
    set proto(protoTask) {
        this._creep = protoTask._creep;
        this._target = protoTask._target;
        this._parent = protoTask._parent;
        this.options = protoTask.options;
        this.data = protoTask.data;
        this.tick = protoTask.tick;
    }
    get creep() {
        return Game.creeps[this._creep.name];
    }
    set creep(creep) {
        this._creep.name = creep.name;
    }
    get target() {
        return deref(this._target.ref);
    }
    get targetPos() {
        if (this.target) {
            this._target._pos = this.target.pos;
        }
        return derefRoomPosition(this._target._pos);
    }
    get parent() {
        return (this._parent ? initializeTask(this._parent) : null);
    }
    set parent(parentTask) {
        this._parent = parentTask ? parentTask.proto : null;
        if (this.creep) {
            this.creep.task = this;
        }
    }
    get manifest() {
        let manifest = [this];
        let parent = this.parent;
        while (parent) {
            manifest.push(parent);
            parent = parent.parent;
        }
        return manifest;
    }
    get targetManifest() {
        let targetRefs = [this._target.ref];
        let parent = this._parent;
        while (parent) {
            targetRefs.push(parent._target.ref);
            parent = parent._parent;
        }
        return _.map(targetRefs, ref => deref(ref));
    }
    get targetPosManifest() {
        let targetPositions = [this._target._pos];
        let parent = this._parent;
        while (parent) {
            targetPositions.push(parent._target._pos);
            parent = parent._parent;
        }
        return _.map(targetPositions, protoPos => derefRoomPosition(protoPos));
    }
    fork(newTask) {
        newTask.parent = this;
        if (this.creep) {
            this.creep.task = newTask;
        }
        return newTask;
    }
    isValid() {
        let validTask = false;
        if (this.creep) {
            validTask = this.isValidTask();
        }
        let validTarget = false;
        if (this.target) {
            validTarget = this.isValidTarget();
        }
        else if (this.options.blind && !Game.rooms[this.targetPos.roomName]) {
            validTarget = true;
        }
        if (validTask && validTarget) {
            return true;
        }
        else {
            this.finish();
            return this.parent ? this.parent.isValid() : false;
        }
    }
    moveToTarget(range = this.settings.targetRange) {
        if (this.options.moveOptions && !this.options.moveOptions.range) {
            this.options.moveOptions.range = range;
        }
        return this.creep.moveTo(this.targetPos, this.options.moveOptions);
    }
    moveToNextPos() {
        if (this.options.nextPos) {
            let nextPos = derefRoomPosition(this.options.nextPos);
            return this.creep.moveTo(nextPos);
        }
    }
    get eta() {
        if (this.creep && this.creep.memory._trav) {
            return this.creep.memory._trav.path.length;
        }
    }
    run() {
        if (this.creep.pos.inRangeTo(this.targetPos, this.settings.targetRange) && !this.creep.pos.isEdge) {
            if (this.settings.workOffRoad) {
                this.parkCreep(this.creep, this.targetPos, true);
            }
            let result = this.work();
            if (this.settings.oneShot && result == OK) {
                this.finish();
            }
            return result;
        }
        else {
            this.moveToTarget();
        }
    }
    parkCreep(creep, pos = creep.pos, maintainDistance = false) {
        let road = _.find(creep.pos.lookFor(LOOK_STRUCTURES), s => s.structureType == STRUCTURE_ROAD);
        if (!road)
            return OK;
        let positions = _.sortBy(creep.pos.availableNeighbors(), (p) => p.getRangeTo(pos));
        if (maintainDistance) {
            let currentRange = creep.pos.getRangeTo(pos);
            positions = _.filter(positions, (p) => p.getRangeTo(pos) <= currentRange);
        }
        let swampPosition;
        for (let position of positions) {
            if (_.find(position.lookFor(LOOK_STRUCTURES), s => s.structureType == STRUCTURE_ROAD))
                continue;
            let terrain = position.lookFor(LOOK_TERRAIN)[0];
            if (terrain === 'swamp') {
                swampPosition = position;
            }
            else {
                return creep.move(creep.pos.getDirectionTo(position));
            }
        }
        if (swampPosition) {
            return creep.move(creep.pos.getDirectionTo(swampPosition));
        }
        return creep.moveTo(pos);
    }
    finish() {
        this.moveToNextPos();
        if (this.creep) {
            this.creep.task = this.parent;
        }
        else {
            console.log(`No creep executing ${this.name}!`);
        }
    }
}

class TaskAttack extends Task {
    constructor(target, options = {}) {
        super(TaskAttack.taskName, target, options);
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(ATTACK) > 0 || this.creep.getActiveBodyparts(RANGED_ATTACK) > 0);
    }
    isValidTarget() {
        return this.target && this.target.hits > 0;
    }
    work() {
        let creep = this.creep;
        let target = this.target;
        let attackReturn = 0;
        let rangedAttackReturn = 0;
        if (creep.getActiveBodyparts(ATTACK) > 0) {
            if (creep.pos.isNearTo(target)) {
                attackReturn = creep.attack(target);
            }
            else {
                attackReturn = this.moveToTarget(1);
            }
        }
        if (creep.pos.inRangeTo(target, 3) && creep.getActiveBodyparts(RANGED_ATTACK) > 0) {
            rangedAttackReturn = creep.rangedAttack(target);
        }
        if (attackReturn == OK && rangedAttackReturn == OK) {
            return OK;
        }
        else {
            if (attackReturn != OK) {
                return rangedAttackReturn;
            }
            else {
                return attackReturn;
            }
        }
    }
}
TaskAttack.taskName = 'attack';

class TaskBuild extends Task {
    constructor(target, options = {}) {
        super(TaskBuild.taskName, target, options);
        this.settings.targetRange = 3;
        this.settings.workOffRoad = true;
    }
    isValidTask() {
        return this.creep.carry.energy > 0;
    }
    isValidTarget() {
        return this.target && this.target.my && this.target.progress < this.target.progressTotal;
    }
    work() {
        return this.creep.build(this.target);
    }
}
TaskBuild.taskName = 'build';

class TaskClaim extends Task {
    constructor(target, options = {}) {
        super(TaskClaim.taskName, target, options);
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(CLAIM) > 0);
    }
    isValidTarget() {
        return (this.target != null && (!this.target.room || !this.target.owner));
    }
    work() {
        return this.creep.claimController(this.target);
    }
}
TaskClaim.taskName = 'claim';

class TaskDismantle extends Task {
    constructor(target, options = {}) {
        super(TaskDismantle.taskName, target, options);
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(WORK) > 0);
    }
    isValidTarget() {
        return this.target && this.target.hits > 0;
    }
    work() {
        return this.creep.dismantle(this.target);
    }
}
TaskDismantle.taskName = 'dismantle';

class TaskFortify extends Task {
    constructor(target, options = {}) {
        super(TaskFortify.taskName, target, options);
        this.settings.targetRange = 3;
        this.settings.workOffRoad = true;
    }
    isValidTask() {
        return (this.creep.carry.energy > 0);
    }
    isValidTarget() {
        let target = this.target;
        return (target != null && target.hits < target.hitsMax);
    }
    work() {
        return this.creep.repair(this.target);
    }
}
TaskFortify.taskName = 'fortify';

const MIN_LIFETIME_FOR_BOOST = 0.9;
function boostCounts(creep) {
    return _.countBy(this.body, bodyPart => bodyPart.boost);
}
const boostParts = {
    'UH': ATTACK,
    'UO': WORK,
    'KH': CARRY,
    'KO': RANGED_ATTACK,
    'LH': WORK,
    'LO': HEAL,
    'ZH': WORK,
    'ZO': MOVE,
    'GH': WORK,
    'GO': TOUGH,
    'UH2O': ATTACK,
    'UHO2': WORK,
    'KH2O': CARRY,
    'KHO2': RANGED_ATTACK,
    'LH2O': WORK,
    'LHO2': HEAL,
    'ZH2O': WORK,
    'ZHO2': MOVE,
    'GH2O': WORK,
    'GHO2': TOUGH,
    'XUH2O': ATTACK,
    'XUHO2': WORK,
    'XKH2O': CARRY,
    'XKHO2': RANGED_ATTACK,
    'XLH2O': WORK,
    'XLHO2': HEAL,
    'XZH2O': WORK,
    'XZHO2': MOVE,
    'XGH2O': WORK,
    'XGHO2': TOUGH,
};
class TaskGetBoosted extends Task {
    constructor(target, boostType, partCount = undefined, options = {}) {
        super(TaskGetBoosted.taskName, target, options);
        this.data.resourceType = boostType;
        this.data.amount = partCount;
    }
    isValidTask() {
        let lifetime = _.any(this.creep.body, part => part.type == CLAIM) ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
        if (this.creep.ticksToLive && this.creep.ticksToLive < MIN_LIFETIME_FOR_BOOST * lifetime) {
            return false;
        }
        let partCount = (this.data.amount || this.creep.getActiveBodyparts(boostParts[this.data.resourceType]));
        return (boostCounts(this.creep)[this.data.resourceType] || 0) < partCount;
    }
    isValidTarget() {
        return true;
    }
    work() {
        let partCount = (this.data.amount || this.creep.getActiveBodyparts(boostParts[this.data.resourceType]));
        if (this.target.mineralType == this.data.resourceType &&
            this.target.mineralAmount >= LAB_BOOST_MINERAL * partCount &&
            this.target.energy >= LAB_BOOST_ENERGY * partCount) {
            return this.target.boostCreep(this.creep, this.data.amount);
        }
        else {
            return ERR_NOT_FOUND;
        }
    }
}
TaskGetBoosted.taskName = 'getBoosted';

class TaskGetRenewed extends Task {
    constructor(target, options = {}) {
        super(TaskGetRenewed.taskName, target, options);
    }
    isValidTask() {
        let hasClaimPart = _.filter(this.creep.body, (part) => part.type == CLAIM).length > 0;
        let lifetime = hasClaimPart ? CREEP_CLAIM_LIFE_TIME : CREEP_LIFE_TIME;
        return this.creep.ticksToLive != undefined && this.creep.ticksToLive < 0.9 * lifetime;
    }
    isValidTarget() {
        return this.target.my;
    }
    work() {
        return this.target.renewCreep(this.creep);
    }
}
TaskGetRenewed.taskName = 'getRenewed';

function hasPos(obj) {
    return obj.pos != undefined;
}
class TaskGoTo extends Task {
    constructor(target, options = {}) {
        if (hasPos(target)) {
            super(TaskGoTo.taskName, { ref: '', pos: target.pos }, options);
        }
        else {
            super(TaskGoTo.taskName, { ref: '', pos: target }, options);
        }
        this.settings.targetRange = 1;
    }
    isValidTask() {
        return !this.creep.pos.inRangeTo(this.targetPos, this.settings.targetRange);
    }
    isValidTarget() {
        return true;
    }
    isValid() {
        let validTask = false;
        if (this.creep) {
            validTask = this.isValidTask();
        }
        if (validTask) {
            return true;
        }
        else {
            let isValid = false;
            if (this.parent) {
                isValid = this.parent.isValid();
            }
            this.finish();
            return isValid;
        }
    }
    work() {
        return OK;
    }
}
TaskGoTo.taskName = 'goTo';

class TaskGoToRoom extends Task {
    constructor(roomName, options = {}) {
        super(TaskGoToRoom.taskName, { ref: '', pos: new RoomPosition(25, 25, roomName) }, options);
        this.settings.targetRange = 24;
    }
    isValidTask() {
        return !this.creep.pos.inRangeTo(this.targetPos, this.settings.targetRange);
    }
    isValidTarget() {
        return true;
    }
    isValid() {
        let validTask = false;
        if (this.creep) {
            validTask = this.isValidTask();
        }
        if (validTask) {
            return true;
        }
        else {
            let isValid = false;
            if (this.parent) {
                isValid = this.parent.isValid();
            }
            this.finish();
            return isValid;
        }
    }
    work() {
        return OK;
    }
}
TaskGoToRoom.taskName = 'goToRoom';

function isSource(obj) {
    return obj.energy != undefined;
}
class TaskHarvest extends Task {
    constructor(target, options = {}) {
        super(TaskHarvest.taskName, target, options);
    }
    isValidTask() {
        return this.creep.store.getFreeCapacity() > 0;
    }
    isValidTarget() {
        if (isSource(this.target)) {
            return this.target.energy > 0;
        }
        else {
            return this.target.mineralAmount > 0;
        }
    }
    work() {
        return this.creep.harvest(this.target);
    }
}
TaskHarvest.taskName = 'harvest';

class TaskHeal extends Task {
    constructor(target, options = {}) {
        super(TaskHeal.taskName, target, options);
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(HEAL) > 0);
    }
    isValidTarget() {
        return this.target && this.target.hits < this.target.hitsMax && this.target.my;
    }
    work() {
        if (this.creep.pos.isNearTo(this.target)) {
            return this.creep.heal(this.target);
        }
        else {
            this.moveToTarget(1);
        }
        return this.creep.rangedHeal(this.target);
    }
}
TaskHeal.taskName = 'heal';

class TaskMeleeAttack extends Task {
    constructor(target, options = {}) {
        super(TaskMeleeAttack.taskName, target, options);
        this.settings.targetRange = 1;
    }
    isValidTask() {
        return this.creep.getActiveBodyparts(ATTACK) > 0;
    }
    isValidTarget() {
        return this.target && this.target.hits > 0;
    }
    work() {
        return this.creep.attack(this.target);
    }
}
TaskMeleeAttack.taskName = 'meleeAttack';

class TaskPickup extends Task {
    constructor(target, options = {}) {
        super(TaskPickup.taskName, target, options);
        this.settings.oneShot = true;
    }
    isValidTask() {
        return this.creep.store.getFreeCapacity() > 0;
    }
    isValidTarget() {
        return this.target && this.target.amount > 0;
    }
    work() {
        return this.creep.pickup(this.target);
    }
}
TaskPickup.taskName = 'pickup';

class TaskRangedAttack extends Task {
    constructor(target, options = {}) {
        super(TaskRangedAttack.taskName, target, options);
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return this.creep.getActiveBodyparts(RANGED_ATTACK) > 0;
    }
    isValidTarget() {
        return this.target && this.target.hits > 0;
    }
    work() {
        return this.creep.rangedAttack(this.target);
    }
}
TaskRangedAttack.taskName = 'rangedAttack';

class TaskWithdraw extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        super(TaskWithdraw.taskName, target, options);
        this.settings.oneShot = true;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        let amount = this.data.amount || 1;
        return this.creep.store.getFreeCapacity() >= amount;
    }
    isValidTarget() {
        let amount = this.data.amount || 1;
        let target = this.target;
        if (target instanceof Tombstone || isStoreStructure(target)) {
            return (target.store[this.data.resourceType] || 0) >= amount;
        }
        else if (isEnergyStructure(target) && this.data.resourceType == RESOURCE_ENERGY) {
            return target.energy >= amount;
        }
        else {
            if (target instanceof StructureLab) {
                return this.data.resourceType == target.mineralType && target.mineralAmount >= amount;
            }
            else if (target instanceof StructureNuker) {
                return this.data.resourceType == RESOURCE_GHODIUM && target.ghodium >= amount;
            }
            else if (target instanceof StructurePowerSpawn) {
                return this.data.resourceType == RESOURCE_POWER && target.power >= amount;
            }
        }
        return false;
    }
    work() {
        return this.creep.withdraw(this.target, this.data.resourceType, this.data.amount);
    }
}
TaskWithdraw.taskName = 'withdraw';

class TaskRepair extends Task {
    constructor(target, options = {}) {
        super(TaskRepair.taskName, target, options);
        this.settings.targetRange = 3;
    }
    isValidTask() {
        return this.creep.carry.energy > 0;
    }
    isValidTarget() {
        return this.target && this.target.hits < this.target.hitsMax;
    }
    work() {
        let result = this.creep.repair(this.target);
        if (this.target.structureType == STRUCTURE_ROAD) {
            let newHits = this.target.hits + this.creep.getActiveBodyparts(WORK) * REPAIR_POWER;
            if (newHits > this.target.hitsMax) {
                this.finish();
            }
        }
        return result;
    }
}
TaskRepair.taskName = 'repair';

class TaskReserve extends Task {
    constructor(target, options = {}) {
        super(TaskReserve.taskName, target, options);
    }
    isValidTask() {
        return (this.creep.getActiveBodyparts(CLAIM) > 0);
    }
    isValidTarget() {
        let target = this.target;
        return (target != null && !target.owner && (!target.reservation || target.reservation.ticksToEnd < 4999));
    }
    work() {
        return this.creep.reserveController(this.target);
    }
}
TaskReserve.taskName = 'reserve';

class TaskSignController extends Task {
    constructor(target, signature = 'Your signature here', options = {}) {
        super(TaskSignController.taskName, target, options);
        this.data.signature = signature;
    }
    isValidTask() {
        return true;
    }
    isValidTarget() {
        let controller = this.target;
        return (!controller.sign || controller.sign.text != this.data.signature);
    }
    work() {
        return this.creep.signController(this.target, this.data.signature);
    }
}
TaskSignController.taskName = 'signController';

class TaskTransfer extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        super(TaskTransfer.taskName, target, options);
        this.settings.oneShot = true;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        let amount = this.data.amount || 1;
        let resourcesInCarry = this.creep.carry[this.data.resourceType] || 0;
        return resourcesInCarry >= amount;
    }
    isValidTarget() {
        let amount = this.data.amount || 1;
        return this.target.store.getFreeCapacity(this.data.resourceType) >= amount;
    }
    work() {
        return this.creep.transfer(this.target, this.data.resourceType, this.data.amount);
    }
}
TaskTransfer.taskName = 'transfer';

class TaskUpgrade extends Task {
    constructor(target, options = {}) {
        super(TaskUpgrade.taskName, target, options);
        this.settings.targetRange = 3;
        this.settings.workOffRoad = true;
    }
    isValidTask() {
        return (this.creep.carry.energy > 0);
    }
    isValidTarget() {
        return this.target && this.target.my;
    }
    work() {
        return this.creep.upgradeController(this.target);
    }
}
TaskUpgrade.taskName = 'upgrade';

class TaskDrop extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        if (target instanceof RoomPosition) {
            super(TaskDrop.taskName, { ref: '', pos: target }, options);
        }
        else {
            super(TaskDrop.taskName, { ref: '', pos: target.pos }, options);
        }
        this.settings.oneShot = true;
        this.settings.targetRange = 0;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        let amount = this.data.amount || 1;
        let resourcesInCarry = this.creep.carry[this.data.resourceType] || 0;
        return resourcesInCarry >= amount;
    }
    isValidTarget() {
        return true;
    }
    isValid() {
        let validTask = false;
        if (this.creep) {
            validTask = this.isValidTask();
        }
        if (validTask) {
            return true;
        }
        else {
            let isValid = false;
            if (this.parent) {
                isValid = this.parent.isValid();
            }
            this.finish();
            return isValid;
        }
    }
    work() {
        return this.creep.drop(this.data.resourceType, this.data.amount);
    }
}
TaskDrop.taskName = 'drop';

class TaskInvalid extends Task {
    constructor(target, options = {}) {
        super('INVALID', target, options);
    }
    isValidTask() {
        return false;
    }
    isValidTarget() {
        return false;
    }
    work() {
        return OK;
    }
}
TaskInvalid.taskName = 'invalid';

class TaskTransferAll extends Task {
    constructor(target, skipEnergy = false, options = {}) {
        super(TaskTransferAll.taskName, target, options);
        this.data.skipEnergy = skipEnergy;
    }
    isValidTask() {
        for (let resourceType in this.creep.carry) {
            if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
                continue;
            }
            let amountInCarry = this.creep.carry[resourceType] || 0;
            if (amountInCarry > 0) {
                return true;
            }
        }
        return false;
    }
    isValidTarget() {
        return this.target.store.getFreeCapacity() > 0;
    }
    work() {
        for (let resourceType in this.creep.carry) {
            if (this.data.skipEnergy && resourceType == RESOURCE_ENERGY) {
                continue;
            }
            let amountInCarry = this.creep.carry[resourceType] || 0;
            if (amountInCarry > 0) {
                return this.creep.transfer(this.target, resourceType);
            }
        }
        return -1;
    }
}
TaskTransferAll.taskName = 'transferAll';

class TaskWithdrawAll extends Task {
    constructor(target, options = {}) {
        super(TaskWithdrawAll.taskName, target, options);
    }
    isValidTask() {
        return this.creep.store.getFreeCapacity() > 0;
    }
    isValidTarget() {
        return this.target.store.getUsedCapacity() > 0;
    }
    work() {
        for (let resourceType in this.target.store) {
            let amountInStore = this.target.store[resourceType] || 0;
            if (amountInStore > 0) {
                return this.creep.withdraw(this.target, resourceType);
            }
        }
        return -1;
    }
}
TaskWithdrawAll.taskName = 'withdrawAll';

function initializeTask(protoTask) {
    let taskName = protoTask.name;
    let target = deref(protoTask._target.ref);
    let task;
    switch (taskName) {
        case TaskAttack.taskName:
            task = new TaskAttack(target);
            break;
        case TaskBuild.taskName:
            task = new TaskBuild(target);
            break;
        case TaskClaim.taskName:
            task = new TaskClaim(target);
            break;
        case TaskDismantle.taskName:
            task = new TaskDismantle(target);
            break;
        case TaskDrop.taskName:
            task = new TaskDrop(derefRoomPosition(protoTask._target._pos));
            break;
        case TaskFortify.taskName:
            task = new TaskFortify(target);
            break;
        case TaskGetBoosted.taskName:
            task = new TaskGetBoosted(target, protoTask.data.resourceType);
            break;
        case TaskGetRenewed.taskName:
            task = new TaskGetRenewed(target);
            break;
        case TaskGoTo.taskName:
            task = new TaskGoTo(derefRoomPosition(protoTask._target._pos));
            break;
        case TaskGoToRoom.taskName:
            task = new TaskGoToRoom(protoTask._target._pos.roomName);
            break;
        case TaskHarvest.taskName:
            task = new TaskHarvest(target);
            break;
        case TaskHeal.taskName:
            task = new TaskHeal(target);
            break;
        case TaskMeleeAttack.taskName:
            task = new TaskMeleeAttack(target);
            break;
        case TaskPickup.taskName:
            task = new TaskPickup(target);
            break;
        case TaskRangedAttack.taskName:
            task = new TaskRangedAttack(target);
            break;
        case TaskRepair.taskName:
            task = new TaskRepair(target);
            break;
        case TaskReserve.taskName:
            task = new TaskReserve(target);
            break;
        case TaskSignController.taskName:
            task = new TaskSignController(target);
            break;
        case TaskTransfer.taskName:
            task = new TaskTransfer(target);
            break;
        case TaskTransferAll.taskName:
            task = new TaskTransferAll(target);
            break;
        case TaskUpgrade.taskName:
            task = new TaskUpgrade(target);
            break;
        case TaskWithdraw.taskName:
            task = new TaskWithdraw(target);
            break;
        case TaskWithdrawAll.taskName:
            task = new TaskWithdrawAll(target);
            break;
        default:
            console.log(`Invalid task name: ${taskName}! task.creep: ${protoTask._creep.name}. Deleting from memory!`);
            task = new TaskInvalid(target);
            break;
    }
    task.proto = protoTask;
    return task;
}

class TargetCache {
    constructor() {
        this.targets = {};
        this.tick = Game.time;
    }
    cacheTargets() {
        this.targets = {};
        for (let i in Game.creeps) {
            let creep = Game.creeps[i];
            let task = creep.memory.task;
            while (task) {
                if (!this.targets[task._target.ref])
                    this.targets[task._target.ref] = [];
                this.targets[task._target.ref].push(creep.name);
                task = task._parent;
            }
        }
    }
    static assert() {
        if (!(Game.TargetCache && Game.TargetCache.tick == Game.time)) {
            Game.TargetCache = new TargetCache();
            Game.TargetCache.build();
        }
    }
    build() {
        this.cacheTargets();
    }
}

Object.defineProperty(Creep.prototype, 'task', {
    get() {
        if (!this._task) {
            let protoTask = this.memory.task;
            this._task = protoTask ? initializeTask(protoTask) : null;
        }
        return this._task;
    },
    set(task) {
        TargetCache.assert();
        let oldProtoTask = this.memory.task;
        if (oldProtoTask) {
            let oldRef = oldProtoTask._target.ref;
            if (Game.TargetCache.targets[oldRef]) {
                _.remove(Game.TargetCache.targets[oldRef], name => name == this.name);
            }
        }
        this.memory.task = task ? task.proto : null;
        if (task) {
            if (task.target) {
                if (!Game.TargetCache.targets[task.target.ref]) {
                    Game.TargetCache.targets[task.target.ref] = [];
                }
                Game.TargetCache.targets[task.target.ref].push(this.name);
            }
            task.creep = this;
        }
        this._task = null;
    },
});
Creep.prototype.run = function () {
    if (this.task) {
        return this.task.run();
    }
};
Object.defineProperties(Creep.prototype, {
    'hasValidTask': {
        get() {
            return this.task && this.task.isValid();
        }
    },
    'isIdle': {
        get() {
            return !this.hasValidTask;
        }
    }
});
Object.defineProperty(RoomObject.prototype, 'ref', {
    get: function () {
        return this.id || this.name || '';
    },
});
Object.defineProperty(RoomObject.prototype, 'targetedBy', {
    get: function () {
        TargetCache.assert();
        return _.map(Game.TargetCache.targets[this.ref], name => Game.creeps[name]);
    },
});
Object.defineProperty(RoomPosition.prototype, 'isEdge', {
    get: function () {
        return this.x == 0 || this.x == 49 || this.y == 0 || this.y == 49;
    },
});
Object.defineProperty(RoomPosition.prototype, 'neighbors', {
    get: function () {
        let adjPos = [];
        for (let dx of [-1, 0, 1]) {
            for (let dy of [-1, 0, 1]) {
                if (!(dx == 0 && dy == 0)) {
                    let x = this.x + dx;
                    let y = this.y + dy;
                    if (0 < x && x < 49 && 0 < y && y < 49) {
                        adjPos.push(new RoomPosition(x, y, this.roomName));
                    }
                }
            }
        }
        return adjPos;
    }
});
RoomPosition.prototype.isPassible = function (ignoreCreeps = false) {
    if (Game.map.getTerrainAt(this) == 'wall')
        return false;
    if (this.isVisible) {
        if (ignoreCreeps == false && this.lookFor(LOOK_CREEPS).length > 0)
            return false;
        let impassibleStructures = _.filter(this.lookFor(LOOK_STRUCTURES), function (s) {
            return this.structureType != STRUCTURE_ROAD &&
                s.structureType != STRUCTURE_CONTAINER &&
                !(s.structureType == STRUCTURE_RAMPART && (s.my ||
                    s.isPublic));
        });
        return impassibleStructures.length == 0;
    }
    return true;
};
RoomPosition.prototype.availableNeighbors = function (ignoreCreeps = false) {
    return _.filter(this.neighbors, pos => pos.isPassible(ignoreCreeps));
};

class TaskCreepWithdraw extends Task {
    constructor(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        super(TaskCreepWithdraw.taskName, target, options);
        this.settings.oneShot = true;
        this.data.resourceType = resourceType;
        this.data.amount = amount;
    }
    isValidTask() {
        const amount = this.data.amount || 1;
        return _.sum(this.creep.carry) <= this.creep.carryCapacity - amount;
    }
    isValidTarget() {
        const amount = this.data.amount || 1;
        const target = this.target;
        return (target.carry[this.data.resourceType] || 0) >= amount;
    }
    work() {
        return this.target.transfer(this.creep, this.data.resourceType, this.data.amount);
    }
}
TaskCreepWithdraw.taskName = "creep_withdraw";

class Tasks {
    static chain(tasks, setNextPos = true) {
        if (tasks.length == 0) {
            return null;
        }
        if (setNextPos) {
            for (let i = 0; i < tasks.length - 1; i++) {
                tasks[i].options.nextPos = tasks[i + 1].targetPos;
            }
        }
        let task = _.last(tasks);
        tasks = _.dropRight(tasks);
        for (let i = (tasks.length - 1); i >= 0; i--) {
            task = task.fork(tasks[i]);
        }
        return task;
    }
    static attack(target, options = {}) {
        return new TaskAttack(target, options);
    }
    static build(target, options = {}) {
        return new TaskBuild(target, options);
    }
    static claim(target, options = {}) {
        return new TaskClaim(target, options);
    }
    static dismantle(target, options = {}) {
        return new TaskDismantle(target, options);
    }
    static drop(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        return new TaskDrop(target, resourceType, amount, options);
    }
    static fortify(target, options = {}) {
        return new TaskFortify(target, options);
    }
    static getBoosted(target, boostType, amount = undefined, options = {}) {
        return new TaskGetBoosted(target, boostType, amount, options);
    }
    static getRenewed(target, options = {}) {
        return new TaskGetRenewed(target, options);
    }
    static goTo(target, options = {}) {
        return new TaskGoTo(target, options);
    }
    static goToRoom(target, options = {}) {
        return new TaskGoToRoom(target, options);
    }
    static harvest(target, options = {}) {
        return new TaskHarvest(target, options);
    }
    static heal(target, options = {}) {
        return new TaskHeal(target, options);
    }
    static meleeAttack(target, options = {}) {
        return new TaskMeleeAttack(target, options);
    }
    static pickup(target, options = {}) {
        return new TaskPickup(target, options);
    }
    static rangedAttack(target, options = {}) {
        return new TaskRangedAttack(target, options);
    }
    static repair(target, options = {}) {
        return new TaskRepair(target, options);
    }
    static reserve(target, options = {}) {
        return new TaskReserve(target, options);
    }
    static signController(target, signature, options = {}) {
        return new TaskSignController(target, signature, options);
    }
    static transfer(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        return new TaskTransfer(target, resourceType, amount, options);
    }
    static transferAll(target, skipEnergy = false, options = {}) {
        return new TaskTransferAll(target, skipEnergy, options);
    }
    static upgrade(target, options = {}) {
        return new TaskUpgrade(target, options);
    }
    static withdraw(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        return new TaskWithdraw(target, resourceType, amount, options);
    }
    static withdrawAll(target, options = {}) {
        return new TaskWithdrawAll(target, options);
    }
    static creepWithdraw(target, resourceType = RESOURCE_ENERGY, amount = undefined, options = {}) {
        return new TaskCreepWithdraw(target, resourceType, amount, options);
    }
}

module.exports = Tasks;
