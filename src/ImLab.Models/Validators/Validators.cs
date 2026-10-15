using FluentValidation;
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
        RuleFor(x => x.DiscountPercent).InclusiveBetween(0, 100);
        RuleFor(x => x.PaidAmount).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Tests).NotEmpty().WithMessage("Select at least one test.");
        RuleForEach(x => x.Tests).ChildRules(t => t.RuleFor(i => i.TestId).GreaterThan(0));
    }
}
