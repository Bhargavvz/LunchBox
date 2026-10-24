package com.lunchbox.architecture;

import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchCondition;
import com.tngtech.archunit.lang.ArchRule;
import com.tngtech.archunit.lang.ConditionEvents;
import com.tngtech.archunit.lang.SimpleConditionEvent;
import jakarta.persistence.Entity;
import org.springframework.data.repository.Repository;
import org.springframework.web.bind.annotation.RestController;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/**
 * Module boundaries of the modular monolith (CLAUDE.md §5): modules talk through public interfaces and domain events,
 * never through each other's repositories or entities, and entities never reach the web layer.
 */
@AnalyzeClasses(packages = "com.lunchbox", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    private static final String ROOT = "com.lunchbox";

    private static final String[] FEATURE_MODULES = {
            "auth", "users", "children", "schools", "addresses", "serviceareas", "subscriptions", "orders", "dispatch",
            "tracking", "verification", "notifications", "payments", "payouts", "reports", "audit", "admin"};

    @ArchTest
    static final ArchRule repositoriesStayInsideTheirModule = classes()
            .that().areAssignableTo(Repository.class)
            .should(onlyBeUsedInsideTheirOwnModule())
            .because("modules must not reach into each other's repositories");

    @ArchTest
    static final ArchRule entitiesStayInsideTheirModule = classes()
            .that().areAnnotatedWith(Entity.class)
            .should(onlyBeUsedInsideTheirOwnModule())
            .because("other modules see a module's data only through its public directory interfaces and DTOs");

    @ArchTest
    static final ArchRule controllersDoNotUseRepositories = noClasses()
            .that().areAnnotatedWith(RestController.class)
            .should().dependOnClassesThat().areAssignableTo(Repository.class)
            .because("layers are controller → service → repository");

    @ArchTest
    static final ArchRule controllersDoNotSeeEntities = noClasses()
            .that().areAnnotatedWith(RestController.class)
            .should().dependOnClassesThat().areAnnotatedWith(Entity.class)
            .because("entities never leave the service layer; controllers speak DTOs");

    @ArchTest
    static final ArchRule commonDependsOnNoFeatureModule = noClasses()
            .that().resideInAPackage(ROOT + ".common..")
            .should().dependOnClassesThat().resideInAnyPackage(featurePackages())
            .because("common is shared infrastructure and must stay free of feature dependencies");

    private static String[] featurePackages() {
        String[] packages = new String[FEATURE_MODULES.length];
        for (int i = 0; i < FEATURE_MODULES.length; i++) {
            packages[i] = ROOT + "." + FEATURE_MODULES[i] + "..";
        }
        return packages;
    }

    /** First package segment below {@code com.lunchbox}, e.g. {@code orders} for {@code com.lunchbox.orders.web}. */
    static String moduleOf(JavaClass javaClass) {
        String pkg = javaClass.getPackageName();
        if (!pkg.startsWith(ROOT + ".")) {
            return pkg;
        }
        String rest = pkg.substring(ROOT.length() + 1);
        int dot = rest.indexOf('.');
        return dot < 0 ? rest : rest.substring(0, dot);
    }

    private static ArchCondition<JavaClass> onlyBeUsedInsideTheirOwnModule() {
        return new ArchCondition<>("only be used inside their own module") {
            @Override
            public void check(JavaClass target, ConditionEvents events) {
                String module = moduleOf(target);
                for (Dependency dependency : target.getDirectDependenciesToSelf()) {
                    JavaClass origin = dependency.getOriginClass();
                    if (origin.getPackageName().startsWith(ROOT) && !moduleOf(origin).equals(module)) {
                        events.add(SimpleConditionEvent.violated(dependency, dependency.getDescription()));
                    }
                }
            }
        };
    }
}
