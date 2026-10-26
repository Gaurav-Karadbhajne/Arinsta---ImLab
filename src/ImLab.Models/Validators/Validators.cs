using FluentValidation;
using ImLab.Models.Services;
using ImLab.Models.ViewModels;

namespace ImLab.Models.Validators;

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.CompanyId).NotEmpty().MaximumLength(30).Matches("^[A-Za-z0-9_-]+$");
        RuleFor(x => x.Username).NotEmpty().MaximumLength(60);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}

public sealed class BookingFormValidator : AbstractValidator<BookingForm>
{
    public BookingFormValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(80);
        RuleFor(x => x.Gender).NotEmpty();
        RuleFor(x => x.AgeYears).InclusiveBetween(0, 120);
        RuleFor(x => x.AgeMonths).InclusiveBetween(0, 11);       // 0-11 months, 0-31 days - like the M/D boxes
        RuleFor(x => x.AgeDays).InclusiveBetween(0, 31);
        RuleFor(x => x.PatientType).NotEmpty().MaximumLength(20);
        RuleFor(x => x.CollectorFee).GreaterThanOrEqualTo(0);
        RuleFor(x => x.DiscountPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.DiscountAmount).GreaterThanOrEqualTo(0).When(x => x.DiscountAmount.HasValue);
        RuleFor(x => x.BookingDate).LessThanOrEqualTo(_ => IndianTime.Today).When(x => x.BookingDate.HasValue);
        RuleFor(x => x.PaidAmount).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Tests).NotNull();
        // tests OR packages - at least one of the two, mirroring "Select at least one test."
        RuleFor(x => x).Must(f => f.Tests.Count > 0 || f.PackageIds.Count > 0).WithMessage("Select at least one test or package.");
        RuleForEach(x => x.Tests).ChildRules(t =>
        {
            t.RuleFor(i => i.TestId).GreaterThan(0);
            t.RuleFor(i => i.Price).GreaterThanOrEqualTo(0).When(i => i.Price.HasValue);
        });
    }
}
// Runs automatically for every TestForm argument thanks to ValidationFilter (see Filters.cs).
// Errors come back as 400 with the first message — the client shows it under the form.
public sealed class TestFormValidator : AbstractValidator<TestForm>
{
    public TestFormValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ShortName).NotEmpty().MaximumLength(30);
        RuleFor(x => x.DepartmentId).GreaterThan(0).WithMessage("Pick a department.");
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.SortOrder).GreaterThanOrEqualTo(0);
    }
}
