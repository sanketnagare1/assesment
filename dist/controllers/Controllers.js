import ShiftScheduleModel from "../models/ShiftScheduleModel.js";
import { isValidDate, isValidHour } from "./Validations.js";
import { createShiftScheduleResponse, addStaffMemberResponse } from "../utils/responseUtils.js";
import StaffMemberModel from "../models/StaffMemberModel.js";
import ShiftAssignmentModel from "../models/ShiftAssignmentModel.js";
import { isEqual } from "date-fns";
import mongoose from "mongoose";
// Controller to make new Shift Schedule 
export const createShiftSchedule = async (req, res) => {
    const { date, startTime, endTime, requiredStaffCount } = req.body;
    if (!date || !startTime || !endTime || !requiredStaffCount) {
        const response = createShiftScheduleResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    // checking the date format using regex
    if (!isValidDate(date)) {
        const response = createShiftScheduleResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    // hours should be greater than 1 and less than 24
    if (!isValidHour(startTime) || !isValidHour(endTime)) {
        const response = createShiftScheduleResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    try {
        const newShiftSchedule = new ShiftScheduleModel({
            date,
            startTime,
            endTime,
            requiredStaffCount
        });
        const savedShiftSchedule = await newShiftSchedule.save();
        const response = createShiftScheduleResponse(true, savedShiftSchedule);
        return res.status(response.code).json({
            response: response.response,
        });
    }
    catch (error) {
        console.log(error);
        const response = createShiftScheduleResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
};
// controller to add new staff member
export const addStaffMember = async (req, res) => {
    const { name, dates, startTime, endTime } = req.body;
    if (!name || !dates || !startTime || !endTime) {
        const response = addStaffMemberResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    // checking if there is proper date array in request payload
    if (!Array.isArray(dates)) {
        const response = addStaffMemberResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    // Validate the date if is in proper format using regex
    const isValidDates = dates.every((date) => isValidDate(date));
    if (!isValidDates) {
        const response = addStaffMemberResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    // hours should be greater than 1 and less than 24
    if (!isValidHour(startTime) || !isValidHour(endTime)) {
        const response = addStaffMemberResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    try {
        const newStaffMember = new StaffMemberModel({
            name,
            dates,
            startTime,
            endTime
        });
        const savedStaffMember = await newStaffMember.save();
        const response = addStaffMemberResponse(true, savedStaffMember);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
    catch (error) {
        console.log(error);
        const response = addStaffMemberResponse(false);
        return res.status(response.code)
            .json({
            message: response.response
        });
    }
};
// Controller to assign the staff member to shift sheduled after all validations
export const assignStaffToShifts = async (req, res) => {
    let { shiftSheduleId, staffMemberIds } = req.body;
    if (!shiftSheduleId || !staffMemberIds || !Array.isArray(staffMemberIds)) {
        return res.status(400)
            .json({
            message: 'Bad Request'
        });
    }
    try {
        // if given shift Shedule Id is not present in DB
        const shiftSchedule = await ShiftScheduleModel.findById(shiftSheduleId);
        if (!shiftSchedule) {
            return res.status(400)
                .json({
                message: "Invalid shift schedule ID"
            });
        }
        // we have given 2 ids in request, from that 2 ids only one is available in database and other are not
        // then the length of availableStaff will be less than staffMemberIds 1 > 2 so we can say that there are 
        // invalid ids in given array
        // if all ids are available in DB then both array will be equal and availableStaffmembers will have all members
        const availableStaffMembers = await StaffMemberModel.find({ _id: { $in: staffMemberIds } });
        if (availableStaffMembers.length !== staffMemberIds.length) {
            return res.status(400)
                .json({
                meesage: "Invalid staff id in array"
            });
        }
        // Take count of the staff that is currently working in that shift
        const assignedStaffCount = await ShiftAssignmentModel.countDocuments({ shiftSchedule: shiftSheduleId });
        // if current working staff plus members that is going to add is less than required staff then okay
        // but if current working + going to add > required staff then error
        if (assignedStaffCount + staffMemberIds.length > shiftSchedule.requiredStaffCount) {
            return res.status(400)
                .json({
                message: "Given shiftShedule is full you can try assigning staff in different shift"
            });
        }
        // check if given staffmemberids are present in availablestaffids or not and 
        // check if staff member has the dates of the shift schedule he is going to be assigned
        const isAllAvailable = staffMemberIds.every((givenStaffId) => {
            const staffMember = availableStaffMembers.find((availableStaff) => availableStaff.id === givenStaffId);
            console.log(staffMember?.dates);
            console.log(shiftSchedule.date);
            if (staffMember && staffMember.dates.some((date) => isEqual(date, shiftSchedule.date))) {
                return true;
            }
            else {
                return false;
            }
        });
        if (!isAllAvailable) {
            return res.status(400)
                .json({
                message: "Some staffs are not available on the given shift date"
            });
        }
        // Filter out the unavialableStaff from members so that we can display the id of the unavilable user at that time
        const unavailableStaff = staffMemberIds.filter((givenStaffId) => {
            const staffMember = availableStaffMembers.find((availableStaff) => availableStaff.id === givenStaffId);
            return !(staffMember &&
                staffMember.startTime >= shiftSchedule.startTime &&
                staffMember.endTime <= shiftSchedule.endTime);
        });
        if (unavailableStaff.length > 0) {
            // make comma seprated string of unavilable staff ids
            const unavailableStaffIds = unavailableStaff.join(', ');
            return res.status(400).json({
                message: `Staff members with ID ${unavailableStaffIds} are not available in the time range of the given shift`,
            });
        }
        // Check if there is any user who is already working in that shiftSchedule
        const alreadyAssignedStaff = await ShiftAssignmentModel.find({
            shiftSchedule: shiftSheduleId,
            staffMember: { $in: staffMemberIds.map(id => new mongoose.Types.ObjectId(id)) },
        });
        // if already assigned staff exist then filter them from array and just pass new users
        if (alreadyAssignedStaff.length > 0) {
            const alreadyAssignedStaffIds = alreadyAssignedStaff.map((assignment) => assignment.staffMember);
            // Update staffMemberIds with only new staff members
            staffMemberIds = staffMemberIds.filter(id => !alreadyAssignedStaffIds.some(existingId => existingId.equals(id)));
            // If all staff members are already assigned
            if (staffMemberIds.length === 0) {
                return res.status(400).json({
                    message: `All staff members are already assigned to the given shift schedule`,
                });
            }
        }
        // Assign staff members to the shift
        const shiftAssignments = staffMemberIds.map((staffId) => ({
            shiftSchedule: shiftSheduleId,
            staffMember: staffId,
        }));
        // adding the records to DB
        await ShiftAssignmentModel.insertMany(shiftAssignments);
        return res.status(200).json({
            response: 'Staff assigned to shifts successfully',
        });
    }
    catch (error) {
        console.error(error);
        return res.status(400)
            .json({
            response: 'Bad Request'
        });
    }
};
// controller to get details of shift schedule using the date
export const viewShiftDetails = async (req, res) => {
    const { date } = req.body;
    if (!date) {
        return res.status(400)
            .json({
            message: "Bad Request"
        });
    }
    try {
        const shiftDetails = await ShiftScheduleModel.findOne({ date });
        if (!shiftDetails) {
            return res.status(400)
                .json({
                message: "No shift details found for given date"
            });
        }
        return res.status(200)
            .json(shiftDetails);
    }
    catch (error) {
        console.log(error);
        return res.status(400)
            .json({
            message: "Bad Request"
        });
    }
};
// controller to update the details of the shift schedule
export const updateShiftDetails = async (req, res) => {
    const { id, date, startTime, endTime, requiredStaffCount } = req.body;
    try {
        const exisitingSchedule = await ShiftScheduleModel.findById(id);
        if (!exisitingSchedule) {
            return res.status(400)
                .json({
                message: "Shift Details not found for the given id"
            });
        }
        exisitingSchedule.date = date;
        exisitingSchedule.startTime = startTime;
        exisitingSchedule.endTime = endTime;
        exisitingSchedule.requiredStaffCount = requiredStaffCount;
        await exisitingSchedule.save();
        return res.status(200)
            .json({
            message: "Shift Details Updated Successfully"
        });
    }
    catch (error) {
        console.log(error);
        return res.status(500)
            .json({
            message: "Internal server error"
        });
    }
};
