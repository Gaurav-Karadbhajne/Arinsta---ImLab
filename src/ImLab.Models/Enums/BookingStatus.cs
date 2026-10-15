namespace ImLab.Models.Enums;

public enum BookingStatus : byte
{
    Registered = 0, SampleReceived = 1, Interfaced = 2, Provisional = 3, PreAuth = 4,
    Authenticated = 5, Delivered = 6, OnHold = 7, Rejected = 8, Cancelled = 9
}

public enum OutsourceStatus : byte { Pending = 0, SampleSent = 1, Received = 2 }
